const fs = require('fs').promises;
const fssync = require('fs');
const axios = require('axios');
const enquirer = require('enquirer');
const AdmZip = require('adm-zip');
const chalk = require('chalk');

const serverurl = "http://letgame.pp.ua:6969";

async function downloadFile(url, destinationPath, spinner) {
    const writer = fssync.createWriteStream(destinationPath);
    const response = await axios({ 
        url, 
        method: 'GET', 
        responseType: 'stream', 
        onDownloadProgress: (progressEvent) => {
            const { loaded, total } = progressEvent;
            const percentCompleted = Math.round((loaded * 100) / total);
            if (spinner) spinner.text = `${percentCompleted}% downloaded.`;
        },
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

(async () => {
    const ora = (await import('ora')).default; //importing esm modules in a commonjs file is annoying

    //verify that we are in proper directory by checking some files
    const checks = [
        fssync.existsSync('../options.txt'),
        fssync.existsSync('../usercache.json'),
        fssync.existsSync('../servers.dat')
    ];
    //fail the program if any of the checks fail
    if (checks.includes(false)) throw new Error(`Directory checks failed! You might have to launch minecraft at least once before running this, or you have unzipped this into the wrong folder.`);

    //check for mods folder and create if doesnt exist
    if (!fssync.existsSync('../mods')) await fs.mkdir('../mods');

    //get mod lists
    const moddir = (await fs.readdir('../mods')).filter(f => f.endsWith('.jar'));
    const modlist = (await axios.get(`${serverurl}/list`)).data.files;

    //ask for user input
    console.log(`                                                                                                                              \n    mmm   m   m   mmm    mmm   m   m          mmm   mmmmm  mmmm  \n   #   "  #   #  #   "  #   "  "m m"         #   "  # # #  #" "# \n    """m  #   #   """m   """m   #m#           """m  # # #  #   # \n   "mmm"  "mm"#  "mmm"  "mmm"   "#           "mmm"  # # #  ##m#" \n                                m"                         #     \n                               ""                          "     `)
    const action = await new enquirer.Select({
        name: 'action',
        message: 'What would you like to do?',
        choices: ['update all', 'update mods', 'update kubejs', 'check mods']
    }).run();

    //check for missing and unneeded mods
    const missingmods = modlist.map(m => !moddir.includes(m) ? m : null).filter(m => m != null);
    const unneededmods = moddir.map(m => !modlist.includes(m) ? m : null).filter(m => m != null);

    const listMods = () => {
        console.log(`\nMissing mods: ${missingmods.length > 0 ? `\n- ${missingmods.map(m => chalk.italic(m)).join('\n- ')}` : '<none>'}`);
        console.log(`\nUnneeded mods: ${unneededmods.length > 0 ? `\n- ${unneededmods.map(m => chalk.italic(m)).join('\n- ')}` : '<none>'}`);
    }

    const updateMods = () => new Promise(async (resolve) => {
        console.log(chalk.bold('\nUpdating mods...\n'));

        //removing old mods.zip if exists
        if (fssync.existsSync('mods.zip')) await fs.unlink('mods.zip');

        listMods();

        //ask for user input to handle unneeded mods
        const deletemodsquestion = unneededmods.length > 0 ? await new enquirer.Confirm({ name: 'deletemods', message: `Delete unneeded mods? (${unneededmods.length} found)` }).run() : false;
        if (deletemodsquestion) {
            const modstokeep = unneededmods.length > 0 ? await new enquirer.MultiSelect({
                    name: 'deletemods',
                    message: 'Choose mods to NOT delete:',
                    limit: unneededmods.length,
                    choices: unneededmods.map(m => ({ name: m, value: m }))
                }).run() : [];
            
            const modstodelete = unneededmods.filter(m => !modstokeep.includes(m));
            if (modstodelete.length > 0) {
                const delmodsspinner = ora(`\nDeleting ${modstodelete.length} unneeded mods...`).start();
                for (const mod of modstodelete) {
                    delmodsspinner.text = `Deleting ${chalk.italic(mod)}`;
                    await fs.unlink('../mods/' + mod);
                }
                delmodsspinner.succeed('Successfully deleted unneeded mods .');
            }
        }

        //download missing mods if needed
        if (missingmods.length > 0) {
            console.log(''); //newline separator
            const modsdlspinner = ora('Starting mods download...').start();
            
            await downloadFile(`${serverurl}/dl/mods`, 'mods.zip', modsdlspinner);
            modsdlspinner.succeed('Download complete.');

            const modsunzipspinner = ora('Reading archive...').start();
            const zip = new AdmZip('mods.zip');
            for (const mod of missingmods) {
                const modfile = zip.getEntry(mod);
                if (!modfile) {
                    modsunzipspinner.fail('An error occured.');
                    throw new Error(`Mod file ${chalk.italic(mod)} wasn't found in the archive, but was found in mods list!\nPlease report this to let_game.`);
                }
                modsdlspinner.text = `Extracting "${modfile.entryName}"...`;
                zip.extractEntryTo(modfile, '../mods/');
            }
            modsunzipspinner.succeed('Mods extracted successfully.');
        } else console.log(`\n${chalk.green("✔")} No missing mods, skipping download.`);

        //finish updater
        console.log(`\n${chalk.green("✔")} All mods are up to date.`);
        resolve();
    });

    const updateKJSScripts = () => new Promise(async (resolve) => {
        console.log(chalk.bold('\nUpdating KubeJS scripts...\n'));

        if (fssync.existsSync('kjs.zip')) await fs.unlink('kjs.zip');

        const kjsspinner = ora('Preparing...').start();

        kjsspinner.text = `Deleting old scripts...`;
        await fs.rm('../kubejs', {recursive: true, force: true});

        kjsspinner.text = 'Downloading new scripts...';
        await downloadFile(`${serverurl}/dl/kjs`, 'kjs.zip');
        kjsspinner.text = 'Downloading scripts complete.';

        kjsspinner.text = 'Reading archive...';
        const zip = new AdmZip('kjs.zip');

        kjsspinner.text = 'Extracting archive...';
        zip.extractAllTo('../kubejs/', true);

        kjsspinner.succeed('All KubeJS scripts are up to date.');
        resolve();
    });

    //handle action
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
        case 'check mods': 
            listMods();
            break;
        default: throw new Error('unknown choice, how did you even get here?')
    }

})().catch(e => {
    console.log(`\n${chalk.bold('An error occured or a prompt was cancelled.')}${e ? `\n${chalk.red(e)}` : ""}`); 
    process.exit(1);
});