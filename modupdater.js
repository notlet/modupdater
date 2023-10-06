const fs = require('fs/promises');
const fssync = require('fs');
const axios = require('axios');
const enquirer = require('enquirer');
const AdmZip = require('adm-zip');
const chalk = require('chalk');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const progress = require('progress');

const serverurl = "https://mods.notlet.dev";

const download = (url, filename, silent) => new Promise(async (res, rej) => {
    const DLProgress = new progress(`${chalk.bold('[')}:bar${chalk.bold(']')} ${chalk.green(':percent')} | ${filename} | :current/:total chunks | :etas`, {
        width: 25,
        complete: chalk.green.bold('━'),
        incomplete: chalk.gray.bold('━'),
        renderThrottle: 1,
        total: 1,
        clear: true
    });

    if (!silent) DLProgress.tick(0);

    const req = await axios({
        url, 
        method: 'GET',
        responseType: 'stream',
        httpAgent: new http.Agent({ keepAlive: true }),
        httpsAgent: new https.Agent({ keepAlive: true }) 
    });

    const writer = fssync.createWriteStream(`temp/${filename}`);

    DLProgress.total = Math.round(req.headers['content-length']);
    if (!silent) req.data.on('data', chunk => DLProgress.tick(chunk.length));
    req.data.pipe(writer);

    writer.on('finish', res);
    writer.on('error', rej);
});

const error = e => {
    if (process.argv.includes('--debug')) console.error(e);
    else console.log(`\n${chalk.bold('An error occured or a prompt was cancelled.')}${e ? `\n${chalk.red(e.message)}` : ""}`);
    process.exit(1);
}

(async () => {
    const ora = (await import('ora')).default; // importing esm modules in a commonjs file is annoying
    const s = (await import('log-symbols')).default;

    // verify that we are in proper directory by checking some files
    const checks = [
        fssync.existsSync('../options.txt'),
        fssync.existsSync('../saves'),
        fssync.existsSync('../resourcepacks')
    ];
    // fail the program if any of the checks fail
    if (checks.includes(false) && !process.argv.includes('--debug')) throw new Error(`Directory checks failed! You might have to launch minecraft at least once before running this, or you have unzipped this into the wrong folder.`);

    // check for needed files and folders and create if doesnt exist
    if (!fssync.existsSync('../mods')) await fs.mkdir('../mods');
    if (!fssync.existsSync('blacklist.json')) await fs.writeFile('blacklist.json', '[]');

    if (fssync.existsSync('temp')) await fs.rm('temp', { recursive: true });
    await fs.mkdir('temp');

    console.log(`                                                                                                                              \n    mmm   m   m   mmm    mmm   m   m          mmm   mmmmm  mmmm  \n   #   "  #   #  #   "  #   "  "m m"         #   "  # # #  #" "# \n    """m  #   #   """m   """m   #m#           """m  # # #  #   # \n   "mmm"  "mm"#  "mmm"  "mmm"   "#           "mmm"  # # #  ##m#" \n                                m"                         #     \n                               ""                          "     `)
    
    // get mod lists
    const modlistspinner = ora('Fetching mod lists...').start();
    const moddir = (await fs.readdir('../mods')).filter(f => f.endsWith('.jar'));
    const modlisttimeout = setTimeout(() => modlistspinner.text = 'Fetching mod lists... (this is taking a bit long, is the server down?)', 10000);
    const modlistreq = await axios.get(`${serverurl}/list`).catch(e => {
        modlistspinner.fail('Failed to fetch mod lists.');
        throw new Error(`Failed while fetching mod lists, server might be down! (${e.message})`);
    });
    clearTimeout(modlisttimeout);

    const modlist = modlistreq.data;
    if (typeof modlist !== 'object' || typeof modlist.length !== 'number') {
        modlistspinner.fail("Failed to fetch mod list.");
        throw new Error("Something went wrong while getting mod lists, data may be malformed.");
    }

    modlistspinner.succeed('Mod list fetched.');
    console.log('');
    
    // ask for user input
    const action = await new enquirer.Select({
        name: 'action',
        message: 'What would you like to do?',
        choices: ['update all', 'update mods', 'update kubejs', 'manage blacklist', 'check mods']
    }).run();

    const blacklist = require('./blacklist.json');
    // check for missing and unneeded mods
    const missingmods = modlist.map(m => !moddir.includes(m.name) ? m.name : null).filter(m => m != null);
    const realunneededmods = moddir.map(m => !modlist.map(mod => mod.name).includes(m) ? m : null).filter(m => m != null);
    const unneededmods = realunneededmods.filter(m => !blacklist.includes(m));

    const listMods = () => {
        console.log(`\n${chalk.green.bold('+')} Missing mods: ${missingmods.length > 0 ? `${missingmods.map(m => chalk.italic(m)).join(', ')}` : chalk.greenBright('<none>')}`);
        console.log(`\n${chalk.red.bold('-')} Unneeded mods: ${realunneededmods.length > 0 ? `${realunneededmods.map(m => blacklist.includes(m) ? chalk.gray.bold(m) : chalk.bold(m)).join(', ')}` : chalk.greenBright('<none>')}`);
    }

    const updateMods = () => new Promise(async (resolve) => {
        try {
            console.log(chalk.bold('\nUpdating mods...'));

            console.log(`\n${chalk.green.bold('+')} Need to download ${chalk.bold(missingmods.length + ' mods')}.\n${chalk.red.bold('-')} Need to delete ${chalk.bold(unneededmods.length + ' mods')}.${blacklist.length > 0 ? chalk.gray(' (skipping ' + blacklist.length + ' due to blacklist)') : ''}\n`);

            if (unneededmods.length > 0) {
                const delmodsspinner = ora(`\nDeleting ${unneededmods.length} mods...`).start();
                for (const mod of unneededmods) {
                    delmodsspinner.text = `Deleting ${chalk.italic(mod)}`;
                    await fs.unlink('../mods/' + mod);
                }
                delmodsspinner.succeed('Successfully deleted unneeded mods.');
                console.log('');
            }

            // download missing mods if needed
            if (missingmods.length > 0) {
                // download the mod files
                for (const mod of missingmods) await download(`${serverurl}/file/${mod}`, mod);
                console.log(`${chalk.green(s.success)} Downloaded mod files.\n`);

                const modspinner = ora('Starting mods verification...').start();
                // verify SHA256 hash and move to mods folder
                for (const mod of missingmods) {
                    modspinner.text = `Verifying ${chalk.bold(mod)} SHA256 checksum...`;
                    const modbuffer = await fs.readFile(`temp/${mod}`);

                    const hashSum = crypto.createHash('sha256').update(modbuffer).digest('hex');
                    if (modlist.find(m => m.name === mod)?.checksum !== hashSum) {
                        modspinner.fail(`Failed to verify ${chalk.bold(mod)}.`)
                        throw new Error(`Failed to verify ${chalk.bold(mod)}! (hash mismatch)\nIs something/someone intercepting your downloads?`);
                    }

                    modspinner.text = `Successfully verified, moving to ${chalk.bold('mods')} folder...`;
                    await fs.rename(`temp/${mod}`, `../mods/${mod}`);
                    modspinner.text = `Done with ${chalk.bold(mod)}.`;
                }

                modspinner.succeed('All mods verified and moved to mods folder.');
            } else console.log(`${s.success} No missing mods, skipping download.`);

            // finish updater
            console.log(`\n${s.success} All mods are up to date.`);
            resolve();
        } catch (e) { error(e); }
    });

    const updateKJSScripts = () => new Promise(async (resolve) => {
        console.log(chalk.bold('\nUpdating KubeJS scripts...\n'));

        if (fssync.existsSync('temp/kubejs.zip')) await fs.unlink('temp/kubejs.zip');

        const kjsspinner = ora('Preparing...').start();

        kjsspinner.text = `Deleting old scripts...`;
        await fs.rm('../kubejs', {recursive: true, force: true});

        kjsspinner.text = 'Downloading new scripts...';
        await download(`${serverurl}/file/kubejs.zip`, 'kubejs.zip', true);
        kjsspinner.text = 'Downloading scripts complete.';

        kjsspinner.text = 'Reading archive...';
        const zip = new AdmZip('temp/kubejs.zip');

        kjsspinner.text = 'Extracting archive...';
        zip.extractAllTo('../kubejs/', true);

        kjsspinner.succeed('All KubeJS scripts are up to date.');
        resolve();
    });

    const manageBlacklist = () => new Promise(async (resolve) => {
        if (unneededmods.length < 1 && blacklist.length < 1) error(new Error('There were no unneeded mods found!'));

        const allunneededmods = unneededmods.concat(blacklist);

        console.log('');
        const newBlacklist = await new enquirer.MultiSelect({
            name: 'blacklist',
            message: 'Pick mods to blacklist from automatic deletion, then press ENTER.',
            limit: unneededmods.length,
            initial: blacklist,
            choices: allunneededmods.map(m => ({name: m, value: m}))
        }).run();

        console.log(`${chalk.blueBright(s.info)} Updating blacklist from ${chalk.bold(blacklist.length + ' items')} to ${chalk.bold(newBlacklist.length + ' items')}.\n`);
        if (!(await new enquirer.Confirm({ name: 'deletemods', message: 'Proceed?' }).run())) error(new Error('Cancelled updating blacklist!'));

        await fs.writeFile('blacklist.json', JSON.stringify(newBlacklist));
        console.log(`${chalk.green(s.success)} Successfully updated blacklist.`);
    })

    // handle action
    switch (action) {
        case 'update all': 
            await updateMods();
            await updateKJSScripts();
            break;
        case 'update mods':
            await updateMods();
            break;
        case 'update kubejs': 
            await updateKJSScripts();
            break;
        case 'manage blacklist':
            await manageBlacklist();
            break;
        case 'check mods': 
            listMods();
            break;
        default: throw new Error('unknown choice, how did you even get here?')
    }
})().catch(error);
