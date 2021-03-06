import { join } from 'path'
import { sync as symlinkSync } from 'symlink-or-copy'
import mkdirp from 'mkdirp'

import { isInitialized, filter, map, forEach, isFile, pluck, log, separator, isLink, exists } from '../util'

export const plugin = function link (program, config, directory) {
  program.command('link')
    .description('Link packages that depend upon each other')
    .action(() => action(config, directory))
}

function action (config, directory) {
  isInitialized(config, 'link')

  if (config.packages.length === 0) {
    return log('no managed packages to symlink')
  }

  const packages = filter(map(config.packages, getPackage(directory)), Boolean)
  const packageNames = map(packages, pluck('name'))

  const findPackagesToSymlink = getPackagesToSymlink(packageNames)

  forEach(packages, function (pkg, index) {
    const { name, dependencies = false, devDependencies = false } = pkg

    // exit early if there are not dependencies to analyze
    if (!dependencies && !devDependencies) return

    const packageNamesToSymlink = findPackagesToSymlink(dependencies)
      .concat(findPackagesToSymlink(devDependencies))
      .map(toManagedNames(packageNames, config.packages))

    if (packageNamesToSymlink.length === 0) {
      log('nothing to symlink to')
      return log(separator())
    }

    log(name, ':')

    symlink(packageNamesToSymlink, config.packages[index], directory)
  })
}

function symlink (packagesToSymlink, symlinkToName, workingDir, done) {
  const nodeDir = join(workingDir, symlinkToName, 'node_modules')

  packagesToSymlink.forEach(function (pkg) {
    const srcDir = join(workingDir, pkg)
    const srcName = require(join(srcDir, 'package.json')).name
    const destinationDir = join(nodeDir, pkg)

    if (isLink(destinationDir)) {
      return log('symlinks for', symlinkToName, 'already exist...')
    }

    mkdirp(nodeDir, function (err) {
      if (err) throw err

      if (isScoped(srcName)) {
        const [scope, name] = srcName.split('/')

        mkdirp(join(nodeDir, scope), function (err) {
          if (err) throw err

          const dest = join(nodeDir, scope, name)

          if (exists(dest)) {
            return log('  ', srcName, 'already exists')
          }

          symlinkSync(srcDir, dest)
        })
      } else {
        if (exists(destinationDir)) {
          return log('  ', srcName, 'already exists')
        }
        symlinkSync(srcDir, destinationDir)
      }
    })
  })
}

function isScoped (name) {
  return name[0] === '@' && name.split('/').length === 2
}

function toManagedNames (packageNames, packages) {
  return function (npmName) {
    return packages[packageNames.indexOf(npmName)]
  }
}

function getPackage (workingDir) {
  return function (packageName) {
    const packagejson = join(workingDir, packageName, 'package.json')

    if (!isFile(packagejson)) {
      return false
    }

    return Object.assign({}, require(packagejson))
  }
}

const getPackagesToSymlink = packageNames => dependencies =>
  dependencies
  ? filter(Object.keys(dependencies), name => packageNames.indexOf(name) > -1)
  : []
