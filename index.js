
const indexedMap = () => {
  const wrapperToWrapped = new Map()
  const wrappedToWrapper = new Map()
  return {
    isWrapped(wrapped) {
      return wrappedToWrapper.has(wrapped)
    },
    isWrapper(wrapper) {
      return wrapperToWrapped.has(wrapper)
    },
    setWrapped(wrapped, wrapper) {
      wrapperToWrapped.set(wrapper, wrapped)
      wrappedToWrapper.set(wrapped, wrapper)
    },
    unwrap(wrapper) {
      return wrapperToWrapped.get(wrapper)
    },
    getWrapper(wrapped) {
      return wrappedToWrapper.get(wrapped)
    }
  }
}

const managedMap = indexedMap()
const nativeMap = indexedMap()
const paths = new Map()

const { setHandler } = require('set-proxy')
const { mapHandler } = require('map-proxies')
const { arrayHandler } = require('array-proxy')

const handler0 = require('spy-property-writes').spyPropertyWrites((target, query, value, write) => {
  if (value instanceof Object) {
    if (managedMap.isWrapper(value)) {
      write(managedMap.unwrap(value))
      return 
    }
    const newValue = wrapNative(value)
    const p = (paths.get(managedMap.getWrapper(target)) || []).concat([query])
    paths.set(newValue, p)
    write(newValue)
  } else {
    if (value !== Object.prototype) {
      console.log(`read, ${paths.get(managedMap.getWrapper(target))} ${query}, value: "${value}"`)
    }
    write(value)
  }
}, setHandler(mapHandler(arrayHandler())))
const handler02 = require('spy-property-reads').spyPropertyReads((target, query, getResult) => {
  const value = getResult()
  if (value instanceof Object) {
    const newValue = wrapManaged(value)
    const p = (paths.get(managedMap.getWrapper(target)) || []).concat([query])
    paths.set(newValue, p)
    return newValue
  }
  return value
}, handler0)

const handler1 = require('spy-property-writes').spyPropertyWrites((target, query, value, write) => {
  if (value instanceof Object) {
    // if it is a wrapper to a native object then we unwrap it, it is safe to pass an unwrapped native object to
    // another unwrapped native object
    if (nativeMap.isWrapper(value)) {
      write(nativeMap.unwrap(value))
      return 
    }
    const newValue = wrapManaged(value)
    const p = (paths.get(nativeMap.getWrapper(target)) || []).concat([query])
    paths.set(newValue, p)
    write(newValue)
  } else {
    write(value)
  }
}, setHandler(mapHandler(arrayHandler())))
const handler2 = require('spy-property-reads').spyPropertyReads((target, query, getResult) => {
  const value = getResult()
  if (value instanceof Object) {
    const newValue = wrapNative(value)
    const p = (paths.get(nativeMap.getWrapper(target)) || []).concat([query])
    paths.set(newValue, p)
    return newValue
  }
  if (value !== Object.prototype) {
    console.log(`read, ${paths.get(nativeMap.getWrapper(target))} ${query}, value: "${value}"`)
  }
  return value
}, handler1)
const wrapNative = o => {
  if (nativeMap.isWrapper(o)) { return o }
  if (nativeMap.isWrapped(o)) { return nativeMap.getWrapper(o) }
  const newValue = new Proxy(o, handler2)
  nativeMap.setWrapped(o, newValue)
  return newValue
} 
const wrapManaged = o => {
  if (managedMap.isWrapper(o)) { return o }
  if (managedMap.isWrapped(o)) { return managedMap.getWrapper(o) }
  const newValue = new Proxy(o, handler02)
  managedMap.setWrapped(o, newValue)
  return newValue
} 

exports.spyPropertyReadsRecursive = wrapNative
