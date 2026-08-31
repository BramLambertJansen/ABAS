const devDependenciesOmitted = (process.env.npm_config_omit ?? '')
  .split(/[\s,]+/)
  .includes('dev')

if (
  process.env.NODE_ENV === 'production' ||
  process.env.HUSKY === '0' ||
  devDependenciesOmitted
) {
  process.exit(0)
}

const husky = (await import('husky')).default

console.log(husky())
