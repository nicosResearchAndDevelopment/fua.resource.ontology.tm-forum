const
    assert     = require('@nrd/fua.core.assert'),
    async      = require('@nrd/fua.core.async'),
    tty        = require('@nrd/fua.core.tty'),
    objects    = require('@nrd/fua.core.objects'),
    subprocess = require('@nrd/fua.module.subprocess'),
    path       = require('path'),
    __root     = path.join(__dirname, '..'),
    fs         = require('fs/promises'),
    git        = subprocess.ExecutionProcess('git', {cwd: __root, verbose: true});

async.iife.process(async function main() {

    try {
        await fs.mkdir(path.join(__root, 'temp'), {recursive: true})
        await fs.access(path.join(__root, 'temp/tm-forum-apis'))
        tty.log.warning('found tm-forum-apis')
    } catch (err) {
        if (err.code !== 'ENOENT') throw err
        tty.log.warning('cloning tm-forum-apis')
        await git('clone', 'git@github.com:tmforum-apis/Open_Api_And_Data_Model.git', 'temp/tm-forum-apis')
    }

    // TODO the following algorithm to collect api definitions does not consider updated versions of a swagger file

    try {
        await fs.access(path.join(__root, 'temp/swagger-files'))
        tty.log.warning('found swagger-files')
    } catch (err) {
        if (err.code !== 'ENOENT') throw err
        tty.log.warning('collecting swagger-files')
        await fs.mkdir(path.join(__root, 'temp/swagger-files'), {recursive: true})
        /** @type {Array<Dirent>} */
        const dirents = await fs.readdir(path.join(__root, 'temp/tm-forum-apis/apis'), {
            withFileTypes: true,
            recursive:     true
        })
        await Promise.all(dirents.map(async (dirent) => {
            if (!dirent.isFile()) return
            if (!dirent.name.endsWith('.swagger.json')) return
            await fs.copyFile(path.join(dirent.parentPath, dirent.name), path.join(__root, 'temp/swagger-files', dirent.name))
        }))
    }

    // TODO the following algorithm to combine definitions must be checked for consistency
    // TODO it might be useful to exclude some definitions from the output

    try {
        await fs.access(path.join(__root, 'temp/combined-definitions.json'))
        tty.log.warning('found combined-definitions.json')
    } catch (err) {
        if (err.code !== 'ENOENT') throw err
        tty.log.warning('creating combined-definitions.json')
        const files               = await fs.readdir(path.join(__root, 'temp/swagger-files'))
        const parsedFiles         = await Promise.all(files.map(async (filename) => {
            const content = await fs.readFile(path.join(__root, 'temp/swagger-files', filename), 'utf-8')
            return JSON.parse(content)
        }))
        const combinedDefinitions = {}
        for (let {definitions} of parsedFiles) {
            if (!definitions) continue
            for (let [typeName, typeDefinition] of Object.entries(definitions)) {
                if (!combinedDefinitions[typeName]) combinedDefinitions[typeName] = typeDefinition
                else objects.extend(combinedDefinitions[typeName], typeDefinition)
            }
        }
        await fs.writeFile(
            path.join(__root, 'temp/combined-definitions.json'),
            JSON.stringify(combinedDefinitions, (key, value) => key === '$ref' ? value.replace('#/definitions/', '#/') : value, 2)
        )
    }

    // FIXME the following approach of generating types does not work very good for so many overlapping type definitions

    try {
        await fs.access(path.join(__root, 'temp/extracted-types.json'))
        tty.log.warning('found extracted-types.json')
    } catch (err) {
        if (err.code !== 'ENOENT') throw err
        tty.log.warning('creating extracted-types.json')

        // const outputs = {
        //     'ObjectType':   {},
        //     'PropertyType': {},
        //     'DataType':     {}
        // }
        // const aliases = {}

        const outputTypes     = new Map()
        // const objectOutputs   = new Map()
        const objectAliases   = {}
        // const propertyOutputs = new Map()
        const propertyAliases = {
            'MacAddressType':         'macAddressType',
            'BillCycleSpecification': 'billCycleSpecification'
        }
        // const datatypeOutputs = new Map()
        // const datatypeAliases = {}

        function addObjectType(param) {
            const id = objectAliases[param.id] || param.id
            assert.string(id)
            assert(!outputTypes.has(id), 'duplicate ObjectType ' + id)
            outputTypes.set(id, {type: 'ObjectType', id})
            const type = outputTypes.get(id)
            if (param.description) type.description = param.description
            if (param.properties) type.properties = Object.entries(param.properties)
                .map(([key, value]) => addPropertyType({id: key, source: type, ...value}).id)
            if (param.required) type.required = param.required.map(value => propertyAliases[value] || value)
            return type
        }

        function addPropertyType(param) {
            const id = propertyAliases[param.id] || param.id
            assert.string(id)
            if (!outputTypes.has(id)) outputTypes.set(id, {type: 'PropertyType', id, refs: []})
            const type = outputTypes.get(id)
            assert(type.type === 'PropertyType', 'invalid PropertyType ' + id)
            const ref = {}
            if (param.description) ref.description = param.description
            if (param.source) ref.source = param.source.id
            if (param.type === 'array') ref.multi = true
            const def = ref.multi ? param.items : param
            if (def.$ref) {
                const refId = def.$ref.replace('#/', '')
                ref.range   = objectAliases[refId] || refId
            } else {
                const datatype = addDataType(def)
                ref.range      = datatype.id
            }
            type.refs.push(ref)
            return type
        }

        function addDataType(param) {
            const id = param.format ? param.type + ':' + param.format : param.type
            assert.string(id)
            if (!outputTypes.has(id)) outputTypes.set(id, {type: 'DataType', id})
            const type = outputTypes.get(id)
            assert(type.type === 'DataType', 'invalid DataType ' + id)
            return type
        }

        const combinedDefinitions = JSON.parse(await fs.readFile(path.join(__root, 'temp/combined-definitions.json'), 'utf-8'))
        for (let [id, definition] of Object.entries(combinedDefinitions)) {
            if (definition.type === 'object') {
                addObjectType({id, ...definition})
            } else {
                tty.error({id, ...definition})
            }
        }
        await fs.writeFile(
            path.join(__root, 'temp/extracted-types.json'),
            JSON.stringify(outputTypes, (key, value) => {
                if (value instanceof Set) return Array.from(value)
                if (value instanceof Map) return Object.fromEntries(value)
                return value
            }, 2)
        )
    }

    // const extractedTypes = JSON.parse(await fs.readFile(path.join(__root, 'temp/extracted-types.json'), 'utf-8'))
    // for (let extractedType of Object.values(extractedTypes)) {
    //     if (extractedType.range && extractedType.range.length > 1)
    //         tty.log({type: extractedType.label, range: extractedType.range})
    // }

})
