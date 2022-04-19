#!/bin/sh 
":" //# comment; exec /usr/bin/env node --experimental-modules "$0" "$@"

import { rmdirSync, mkdirSync, readdirSync, readFileSync, copyFileSync, writeFileSync, statSync } from 'fs'
import { resolve } from 'path'

const args = process.argv
args.shift(2)

const argsDoubleDash = args.map((arg, i) => {
  if (arg.indexOf('--') === 0) {
    return [arg.replace('--', ''), args[i + 1]]
  }

  return null 
}).filter(a => !!a)

const output = argsDoubleDash.find(( [ arg, ] ) => arg === 'output') 
    ? argsDoubleDash.find(( [ arg, ] ) => arg === 'output')[1]
    : undefined

if (!output) 
  throw new Error('must provide --output')

const input = argsDoubleDash.find(( [ arg, v ] ) => arg === 'input') 
    ? argsDoubleDash.find(( [ arg, v ] ) => arg === 'input')[1]
    : undefined

if (!input) 
  throw new Error('must provide --input')

const BUILD_DIR = resolve(process.cwd(), output)
const FROM_DIR = resolve(process.cwd(), input)

const regPartial = new RegExp('{%([\\s\\S]+?)%}', 'gi')
const regStyle = new RegExp('<style>([\\s\\S]+?)</style>', 'mi')
const regScript = new RegExp('<script>([\\s\\S]+?)</script>', 'mi')
const regHead = new RegExp('</head>', 'gi')
const regBody = new RegExp('</body>', 'gi')
const regTrim = new RegExp('<!--(.*?)-->|\\s\\B', 'gi')

const styles = {}
const scripts = {}
const move = []
const errors = []
const targets = { scripts: {}, styles: {} }

console.log('-- cleaning')

clean()

console.log('-- getting data')
const data = getDir('data', parseJSON)
console.log('-- getting templates')
const templates = getDir('templates', makeTemplate)
console.log('-- getting pages')
const html = getDir('pages', makeTemplate)

console.log('-- getting lucky')

build()

function getDir(path, format = x => x) {
  const fullpath = resolve(FROM_DIR, path)
  const result = {}

  readdirSync(fullpath).forEach(file => {
    const s = statSync(resolve(fullpath, file))

    if (s.isDirectory()) {
      return result[file] = getDir(`${path}/${file}`, format)
    } else {
      const filename = file.substr(0, file.lastIndexOf('.'))
      return result[filename] = format(readFileSync(resolve(fullpath, file)).toString().trim(), `${path}/${file}`)
    }
  })

  return result
}

function pathExists(col, path) {
  return !!col.find((content) => content.path === path)
}

function makeTemplate(tpl, path) {
  console.log('\tfetching', path)
  return (data, styles, scripts) => {
    console.log('\trendering', path)
    return tpl
      .replace(regStyle, (_, match) => pathExists(styles, path) ? '' : styles.push({ path, content: match.trim() }) && '')
      .replace(regScript, (_, match) => pathExists(scripts, path) ? '' : scripts.push({ path, content: match.trim() }) && '')
      .replace(regPartial, (_, match) => {
        const m = match.trim();
        const operation = m.substr(0, m.indexOf(':') > -1 ? m.indexOf(':') : m.length);

        switch(operation) {
          case 'map':  {
            const res = m.split(':');

            if (res.length < 3)
              return `Error: missing argument for '${match}' in '${path}'`

            const d = data[res[1]]
            const t = templates[res[2]]

            if (!d) {
              return `Error: missing data for '${match}' in '${path}'`
            } else if (!t) {
              return `Error: missing template for '${match}' in '${path}'`
            }

            return Object.values(d).map(( d, index ) => t({ ...d, index}, styles, scripts)).join('\n')
          } 
          case 'inc': {
            const res = m.split(':');
            const t = templates[res[1]]
            const d = data[res[2]] || {}
            
            if (!d) {
              return `Error: missing data for '${match}' in '${path}'`
            } else if (!t) {
              return `Error: missing template for '${match}' in '${path}'`
            } else if (res.length < 3) {
              return t(data, styles, scripts)
            }

            return t(d, styles, scripts)
          } 
          case 'import': {
            const res = m.split(':');
            const target = res[1]

            if(!target) {
              return `Missing target for 'get' in '${path}'`
            }

            if (target.indexOf('$') === 0) {
              target = data[target.substr(1)] || `Missing variable for '${target}' in ${path}`
            }

            if (target.lastIndexOf('.js') > -1) {
              scripts.push({ target, path })
            } else if (target.lastIndexOf('.css') > -1) {
              styles.push({ target, path }) 
            } else {
              return `wrong file type for 'get' in '${path}': '${target}'`
            }

            return ''
          }
          case 'move': {
            const res = m.split(':');
            let target = res[1]

            if(!target) {
              return `Missing target for 'move' 'in '${path}': '${target}'`
            }

            if (target.indexOf('$') === 0) {
              target = data[target.substr(1)] || `Missing variable for '${target}' in ${path}`
            }

            move.push(target)

            return target
          }
          case 'moveDir': {
            const res = m.split(':');
            let target = res[1]

            if(!target) {
              return `Missing target for 'move' 'in '${path}': '${target}'`
            }

            if (target.indexOf('$') === 0) {
              target = data[target.substr(1)] || `Missing variable for '${target}' in ${path}`
            }

            move.push(target)

            return target
          }
          case 'js': {
            const res = m.substr(m.indexOf(':') + 1);
            return new Function(res)();
          }
          default:
            const res = m.split(':');
            if (!data || data[operation] === undefined) {
              const error = new Error(`Missing data for '${match}' in '${path}'`)
              errors.push(error)
              return ''
            }

            return data[operation]
        }
      })
  }
}

function build() {
  console.log('-- building')
  const pages = makePages(html)

  console.log('-- writing styles')
  writeTargets(styles, readCSSTargets, 'css')

  console.log('-- writing scripts')
  writeTargets(scripts, readJSTargets, 'js')

  console.log('-- moving assets')
  move.forEach(cp)

  console.log('-- writing pages')
  Object.entries(pages).forEach((item) => writePage(item, '.'))

  console.log('\n-- errors:')
  errors.forEach(e => console.log(e.message))
}

function makePages(html) {
  const pages = Object
    .entries(html)
    .map(([name, contents]) => {
      styles[name] = []
      scripts[name] = []

      if (typeof contents === 'object') {
        return [ name , makePages(contents) ]
      }

      return [name, contents(data, styles[name], scripts[name])]
    })
    .reduce((acc, [key, contents]) => {
        acc[key] = contents
        return acc
    }, {})

  return pages
}

function writeTargets(targets, reader, extension) {
  Object.entries(targets)
    .map(([name, contents]) => [name, contents.map(reader)])
    .forEach(([name, contents]) => 
      writeFileSync(resolve(BUILD_DIR, `./assets/${extension}/${name}.${extension}`), contents.reduce(
        (acc, curr) => (acc += `\n${curr.content}`), ''
      ))
    )
}

function cp(name) {
  try {
    copyFileSync(resolve(FROM_DIR, name), resolve(BUILD_DIR, name))
  } catch(e) {
    errors.push(e)
  }
}

function readJSTargets(content) {
  try {
    if (!!content.target && !targets.scripts[content.target]) {
      content.content = readFileSync(resolve(FROM_DIR, content.target).toString().trim())
    } else if (!!content.target) {
      content.content = targets.scripts[content.target]
    } else if (!targets[content.path]) {
      targets.scripts[content.path] = content.content
    }

    return content
  } catch(e) {
    const error = new Error(`contents in "${content.target}" called in "${content.path}" cannot be read`)
    errors.push(error)
    return {
      ...content,
      content: `console.error('${error.message}')`
    }
  }
}

function readCSSTargets(content) {
  try {
    if (!!content.target && !targets.styles[content.target]) {
      content.content = readFileSync(resolve(FROM_DIR, content.target).toString().trim())
    } else if (!!content.target) {
      content.content = targets.styles[content.target]
    } else if (!targets[content.path]) {
      targets.styles[content.path] = content.content
    }

    return content
  } catch(e) {
    const error = new Error(`contents in '${content.target}' called in '${content.path}' cannot be read`)
    errors.push(error)
    return { 
      ...content, 
      content :`
/*
  ${error.message} 
*/\n`
  } }
}

function parseJSON(data, path) {
  try {
    const json = JSON.parse(data)
    return json
  } catch(e) {
    errors.push(e)
    return e.message
  }
}

function writePage([name, contents], path) {
  if (typeof contents === 'object') {
    const nextPath = resolve(BUILD_DIR, path, name)
    mkdirSync(nextPath)
    Object.entries(contents).forEach((item) => writePage(item, `${path}/${name}`))
    return;
  }

  contents = contents.replace(regHead, `<link rel="stylesheet" href="/assets/css/${name}.css" />$&`)
  contents = contents.replace(regBody, `<script type="text/javascript" src=/assets/js/${name}.js></script>$&`)
  contents = contents.replace(regTrim, ' ');

  writeFileSync(resolve(BUILD_DIR, `${path}/${name}.html`), contents)
}

function clean() {
  rmdirSync(BUILD_DIR, { recursive: true })
  mkdirSync(BUILD_DIR)
  mkdirSync(resolve(BUILD_DIR, 'assets'))
  mkdirSync(resolve(BUILD_DIR, 'assets/css'))
  mkdirSync(resolve(BUILD_DIR, 'assets/js'))
}
