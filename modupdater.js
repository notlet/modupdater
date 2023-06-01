const fs = require('fs').promises;
const fssync = require('fs');
const axios = require('axios');
const enquirer = require('enquirer');
const AdmZip = require('adm-zip');

const serverurl = "http://letgame.pp.ua:6969";

async function downloadFile(url, destinationPath) {
    const writer = fssync.createWriteStream(destinationPath);
    const response = await axios({ 
        url, 
        method: 'GET', 
        responseType: 'stream', 
        onDownloadProgress: (progressEvent) => {
            const { loaded, total } = progressEvent;
            const percentCompleted = Math.round((loaded * 100) / total);
            process.stdout.write(`${percentCompleted}% downloaded.\r`);
        },
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

(async () => {
    if (!fssync.existsSync('../mods')) await fs.mkdir('../mods');

    const moddir = (await fs.readdir('../mods')).filter(f => f.endsWith('.jar'));
    const modlist = (await axios.get(`${serverurl}/list`)).data.files;

    console.log(`                                                                                                                              \n    mmm   m   m   mmm    mmm   m   m          mmm   mmmmm  mmmm  \n   #   "  #   #  #   "  #   "  "m m"         #   "  # # #  #" "# \n    """m  #   #   """m   """m   #m#           """m  # # #  #   # \n   "mmm"  "mm"#  "mmm"  "mmm"   "#           "mmm"  # # #  ##m#" \n                                m"                         #     \n                               ""                          "     `)
    const action = await new enquirer.Select({
        name: 'action',
        message: 'What would you like to do?',
        choices: ['update all', 'update mods', 'update kubejs', 'check mods']
    }).run();

    
    const missingmods = modlist.map(m => !moddir.includes(m) ? m : null).filter(m => m != null);
    const unneededmods = moddir.map(m => !modlist.includes(m) ? m : null).filter(m => m != null);

    const listMods = () => {
        console.log(`\nMissing mods: ${missingmods.length > 0 ? `\n- ${missingmods.join('\n- ')}` : '<none>'}\n`);
        console.log(`Unneeded mods: ${unneededmods.length > 0 ? `\n- ${unneededmods.join('\n- ')}` : '<none>'}\n`);
    }

    const updateMods = () => new Promise(async (resolve) => {
        console.log('\nUpdating mods...');

        if (fssync.existsSync('mods.zip')) await fs.unlink('mods.zip');

        listMods();

        const deletemodsquestion = await new enquirer.Toggle({ message: `Delete unneeded mods? (${unneededmods.length} found)`, enabled: 'Yes', disabled: 'No' }).run();
        if (deletemodsquestion) {
            let modstokeep = [];
            if (unneededmods.length > 0) {
                modstokeep = await new enquirer.MultiSelect({
                    name: 'deletemods',
                    message: 'Choose mods to NOT delete:',
                    limit: unneededmods.length,
                    choices: unneededmods.map(m => ({ name: m, value: m }))
                }).run();
            }
            const modstodelete = unneededmods.filter(m => !modstokeep.includes(m));

            if (modstodelete.length > 0) {
                console.log(`Deleting ${modstodelete.length} unneeded mods... (${modstodelete.join(', ')})`);
                for (const mod of modstodelete) {
                    console.log(`Deleting "${mod}"`)
                    await fs.unlink('../mods/' + mod);
                }
            }
        }

        if (missingmods.length > 0) {
            console.log('\nDownloading mods... (this might take a bit)');
            await downloadFile(`${serverurl}/dl/mods`, 'mods.zip');
            console.log('Downloading mods complete.\n');

            console.log('Reading archive...');
            const zip = new AdmZip('mods.zip');

            for (const mod of missingmods) {
                const modfile = zip.getEntry(mod);
                if (!modfile) throw new Error(`Mod file ${mod} wasn't found in the archive, but was found in mods list!\nPlease report this to let_game.`);
                console.log(`Extracting "${modfile.entryName}"...`);
                zip.extractEntryTo(modfile, '../mods/');
            }
        } else console.log('No missing mods, skipping download.');

        console.log('\nAll mods have been updated.');
        resolve();
    });

    const updateKJSScripts = () => new Promise(async (resolve) => {
        console.log('\nUpdating KubeJS scripts...\n');

        if (fssync.existsSync('kjs.zip')) await fs.unlink('kjs.zip');

        console.log(`Deleting old scripts...`);
        await fs.rm('../kubejs', {recursive: true, force: true});

        console.log('Downloading new scripts... (this might take a bit)');
        await downloadFile(`${serverurl}/dl/kjs`, 'kjs.zip');
        console.log('Downloading scripts complete.\n');

        console.log('Reading archive...');
        const zip = new AdmZip('kjs.zip');

        console.log('Extracting archive...');
        zip.extractAllTo('../kubejs/', true);

        console.log('\nAll KubeJS scripts have been updated.');
        resolve();
    });


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
    console.log(`An error occured or a prompt was cancelled.${e ? ` (${e})` : ""}`); 
    process.exit(1);
});