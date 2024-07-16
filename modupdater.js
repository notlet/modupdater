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

const { version } = require('./package.json');
if (process.argv.includes('--version')) {
    console.log(version);
    process.exit(0);
}

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

const getHash = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');

const exitOnKey = () => {
    console.log('\nPress any key to exit.');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', process.exit.bind(process, 1));
}

const error = e => {
    if (process.argv.includes('--debug')) console.error(e);
    else console.log(`\n${chalk.bold('An error occured or a prompt was cancelled.')}${e ? `\n${chalk.red(e.message)}` : ""}`);
    exitOnKey();
}

(async () => {
    const ora = (await import('ora')).default; // importing esm modules in a commonjs file is annoying
    const s = (await import('log-symbols')).default;

    // verify that we are in proper directory by checking some files
    const checks = [
        fssync.existsSync('./saves'),
        fssync.existsSync('./screenshots'),
        fssync.existsSync('./resourcepacks')
    ];
    // fail the program if any of the checks fail
    if (checks.includes(false) && !process.argv.includes('--debug') && !fssync.existsSync('nodircheck.txt')) throw new Error(`Directory checks failed! You might have to launch Minecraft at least once, or you are in the wrong directory.\nIf you believe this is an error, you can add a blank file called ${chalk.bold("nodircheck.txt")} in this directory to skip the checks.`);

    // check for needed files and folders and create if doesnt exist
    if (!fssync.existsSync('./mods')) await fs.mkdir('./mods');
    if (!fssync.existsSync('blacklist.json')) await fs.writeFile('blacklist.json', '[]');

    if (fssync.existsSync('temp')) await fs.rm('temp', { recursive: true });
    await fs.mkdir('temp');

    // packaging with bun breaks figlet, so we gotta do this messy method instead
    console.log('  ____  __  __    ____    ____  __  __        ____    ___ ___   _____   \n' +  " /',__\\/\\ \\/\\ \\  /',__\\  /',__\\/\\ \\/\\ \\      /',__\\ /' __` __`\\/\\ '__`\\ \n" +  '/\\__, `\\ \\ \\_\\ \\/\\__, `\\/\\__, `\\ \\ \\_\\ \\    /\\__, `\\/\\ \\/\\ \\/\\ \\ \\ \\L\\ \\\n' +  '\\/\\____/\\ \\____/\\/\\____/\\/\\____/\\/`____ \\   \\/\\____/\\ \\_\\ \\_\\ \\_\\ \\ ,__/\n' +  ' \\/___/  \\/___/  \\/___/  \\/___/  `/___/> \\   \\/___/  \\/_/\\/_/\\/_/\\ \\ \\/ \n' +  '                                    /\\___/                        \\ \\_\\ \n' +  '                                    \\/__/                          \\/_/ ')

    // check github api for any new versions
    const githubResponse = await axios.get('https://api.github.com/repos/notlet/modupdater/releases/latest').catch(() => console.log(chalk.gray(`Failed to check for new updates.`)));
    if (githubResponse?.data) {
        const githubVersion = githubResponse.data.tag_name?.split('-').slice(0, -1).join('-');
        if (githubVersion != version) console.log(`\n${chalk.white.bold('━'.repeat(40))}\n${chalk.blueBright(s.info)} New version available! (${chalk.bold(version)} → ${chalk.bold(githubVersion)})\nPlease download it from ${chalk.blue('https://github.com/notlet/modupdater/releases/tag/' + encodeURIComponent(githubVersion))}\n${chalk.white.bold('━'.repeat(40))}\n`);
    }

    // get mod lists
    const modlistspinner = ora('Fetching mod lists...').start();
    const moddir = (await fs.readdir('./mods')).filter(f => f.endsWith('.jar'));
    const modlisttimeout = setTimeout(() => modlistspinner.text = 'Fetching mod lists... (this is taking a bit long, is the server down?)', 10000);
    const modlistreq = await axios.get(`${serverurl}/mods.json`).catch(e => {
        modlistspinner.fail('Failed to fetch mod lists.');
        throw new Error(`Failed while fetching mod lists, server might be down! (${e.message})`);
    });
    clearTimeout(modlisttimeout);

    const modlist = modlistreq.data;
    if (typeof modlist !== 'object' || typeof modlist.length !== 'number') {
        modlistspinner.fail("Failed to fetch mod lists.");
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

    const blacklist = JSON.parse(await fs.readFile('./blacklist.json'));
    // check for missing and unneeded mods
    const missingmods = modlist.map(m => !moddir.includes(m.name) ? m.name : null).filter(m => m != null);
    const realunneededmods = moddir.map(m => !modlist.map(mod => mod.name).includes(m) ? m : null).filter(m => m != null);
    const unneededmods = realunneededmods.filter(m => !blacklist.includes(m));

    const actions = {
        'update all': () => new Promise(async (resolve) => {
            await actions['update mods']();
            await actions['update kubejs']();
            resolve();
        }),
        'update mods': () => new Promise(async (resolve) => {
            try {
                console.log(chalk.bold('\nUpdating mods...'));

                const modstoverify = moddir.filter(m => !blacklist.includes(m));
                const verifyspinner = ora(`Verifying ${modstoverify.length} mods...`).start();
                verifyspinner.prefixText = '\n';

                for (const mod of modstoverify) {
                    verifyspinner.text = `Checking ${chalk.italic(mod)}`;
                    const hashSum = await getHash(`./mods/${mod}`);
                    if (modlist.find(m => m.name === mod)?.checksum !== hashSum) {
                        verifyspinner.prefixText += ` ${chalk.yellow(s.warning)} Failed to verify ${chalk.bold.italic(mod)}, it will be redownloaded! (hash mismatch)\n`;
                        missingmods.push(mod);
                        unneededmods.push(mod);
                    }
                }
                verifyspinner.succeed('Successfully verified mods.');

                console.log(`\n${chalk.green.bold('+')} Need to download ${chalk.bold(missingmods.length + ' mod' + (missingmods.length == 1 ? '' : 's'))}.\n${chalk.red.bold('-')} Need to delete ${chalk.bold(unneededmods.length + ' mod' + (unneededmods.length == 1 ? '' : 's'))}.${blacklist.length > 0 ? chalk.gray(' (skipping ' + blacklist.length + ' due to blacklist)') : ''}\n`);

                if ((unneededmods.length > 0 || missingmods.length > 0) && !(await new enquirer.Confirm({ name: 'updatemods', message: 'Proceed?' }).run())) return error(new Error('Aborted.'));

                if (unneededmods.length > 0) {
                    console.log('');
                    const delmodsspinner = ora(`\nDeleting ${unneededmods.length} mods...`).start();
                    for (const mod of unneededmods) {
                        delmodsspinner.text = `Deleting ${chalk.italic(mod)}`;
                        await fs.unlink('./mods/' + mod);
                    }
                    delmodsspinner.succeed('Successfully deleted unneeded mods.');
                }

                // download missing mods if needed
                if (missingmods.length > 0) {
                    console.log('');
                    // download the mod files
                    for (const mod of missingmods) await download(`${serverurl}/files/${mod}`, mod);
                    console.log(`${chalk.green(s.success)} Downloaded mod files.\n`);

                    const modspinner = ora('Starting mods verification...').start();
                    // verify SHA256 hash and move to mods folder
                    for (const mod of missingmods) {
                        modspinner.text = `Verifying ${chalk.bold.italic(mod)} SHA256 checksum...`;
                        const hashSum = await getHash(`temp/${mod}`);
                        if (modlist.find(m => m.name === mod)?.checksum !== hashSum) {
                            modspinner.fail(`Failed to verify ${chalk.bold.italic(mod)}.`)
                            throw new Error(`Failed to verify ${chalk.bold.italic(mod)}! (hash mismatch)\nThe file might be corrupted or someone may be intercepting your downloads.`);
                        }

                        modspinner.text = `Successfully verified, moving to ${chalk.bold('mods')} folder...`;
                        await fs.rename(`temp/${mod}`, `./mods/${mod}`);
                        modspinner.text = `Done with ${chalk.bold.italic(mod)}.`;
                    }

                    modspinner.succeed('All mods verified and moved to mods folder.');
                } else console.log(`${s.success} No missing mods, skipping download.`);

                // finish updater
                console.log(`\n${s.success} All mods are up to date.`);
                resolve();
            } catch (e) { error(e); }
        }),
        'update kubejs': () => new Promise(async (resolve) => {
            console.log(chalk.bold('\nUpdating KubeJS scripts...\n'));

            if (fssync.existsSync('temp/kubejs.zip')) await fs.unlink('temp/kubejs.zip');

            const kjsspinner = ora('Preparing...').start();

            kjsspinner.text = `Deleting old scripts...`;
            await fs.rm('./kubejs', {recursive: true, force: true});

            kjsspinner.text = 'Downloading new scripts...';
            await download(`${serverurl}/files/kubejs.zip`, 'kubejs.zip', true);
            kjsspinner.text = 'Downloading scripts complete.';

            kjsspinner.text = 'Reading archive...';
            const zip = new AdmZip('temp/kubejs.zip');

            kjsspinner.text = 'Extracting archive...';
            zip.extractAllTo('./kubejs/', true);

            kjsspinner.succeed('All KubeJS scripts are up to date.');
            resolve();
        }),
        'manage blacklist': () => new Promise(async (resolve) => {
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
            resolve();
        }),
        'check mods': () => new Promise((resolve) => {
            console.log(`\n${chalk.green.bold('+')} Missing mods: ${missingmods.length > 0 ? `${missingmods.map(m => chalk.italic(m)).join(', ')}` : chalk.greenBright('<none>')}`);
            console.log(`\n${chalk.red.bold('-')} Unneeded mods: ${realunneededmods.length > 0 ? `${realunneededmods.map(m => blacklist.includes(m) ? chalk.gray.bold(m) : chalk.bold(m)).join(', ')}` : chalk.greenBright('<none>')}`);
            resolve()
        })
    }

    // handle action
    if (!Object.keys(actions).includes(action)) throw new Error('unknown choice, how did you even get here?');

    await actions[action]();
    exitOnKey();
})().catch(error);
