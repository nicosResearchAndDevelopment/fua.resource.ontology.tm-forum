const
    assert  = require('@nrd/fua.core.assert'),
    async   = require('@nrd/fua.core.async'),
    tty     = require('@nrd/fua.core.tty'),
    objects = require('@nrd/fua.core.objects'),
    path    = require('path'),
    fs      = require('fs/promises'),
    crypto  = require('crypto'),
    __root  = path.join(__dirname, '..');

async.iife.process(async function main() {
    const schemaFiles = (await fs.readdir(
        path.join(__root, 'temp/tm-forum-apis/schemas'),
        {withFileTypes: true, recursive: true}
    )).filter(dirent => dirent.isFile() && dirent.name.endsWith('.schema.json'))

    const schemata = await Promise.all(schemaFiles.map(async (dirent) => {
        const filePath = path.join(dirent.parentPath, dirent.name)
        const content  = await fs.readFile(filePath, 'utf-8')
        return JSON.parse(content)
    }))

    const schemataMap = new Map()
    for (let index = 0; index < schemata.length; index++) {
        const dirent       = schemaFiles[index]
        const relativePath = path.relative(
            path.join(__root, 'temp/tm-forum-apis/schemas'),
            path.join(dirent.parentPath, dirent.name)
        ).replace(/\\/g, '/')
        const schema       = schemata[index]
        schemataMap.set(relativePath, schema)
    }

    // console.log(Array.from(schemataMap.keys()))
    console.log(Array.from(schemataMap.values()).filter(schema => !schema.definitions))

    // NOTE the following was just for testing varieties in the schemata
    // const test = {}
    // JSON.stringify(schemata, (key, value) => {
    //     if (value && typeof value === 'object') {
    //         const keys = Object.keys(value)
    //         // if (keys.includes('$ref') && keys.length > 1) {
    //         //     const id   = keys.sort().join(',')
    //         //     const set  = test[id] || (test[id] = {})
    //         //     const elem = Object.fromEntries(keys.sort().map(k => [k, value[k]]))
    //         //     const hash = crypto.createHash('sha1').update(JSON.stringify(elem)).digest('base64')
    //         //     set[hash]  = elem
    //         // }
    //         if (keys.includes('$id') && !keys.includes('$schema') && !value['$id'].startsWith('#')) {
    //             const elem = Object.fromEntries(keys.sort().map(k => [k, value[k]]))
    //             console.log(elem)
    //         }
    //     }
    //     return value
    // })
    // console.log(Object.keys(test))
    // // console.log(Object.values(test['$ref,description']))
    // // console.log(Object.values(test['$comment,$ref']))
    // // console.log(Object.values(test['$ref,type']))
    // // console.log(Object.values(test['$ref,description,type']))
    // console.log(Object.values(test['$ref,description,example']))
})
