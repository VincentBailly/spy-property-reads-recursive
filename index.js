
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
      return wrapperToWrapped.get(wrapper) || wrapper
    },
    getWrapper(wrapped) {
      return wrappedToWrapper.get(wrapped)
    }
  }
}

// The nodes are the unwrapped objects
// Types:
//   target: any
//   id: number
//   sourceId: number
//   targetId: number
//   query: string
//
//   nodeIds: Map<target, id>
//   nodesById: Map<id, target>
//   linksBySource: Map<sourceId, Map<query, Array<targetId>>>
//   linksByTarget: Map<targetId, Map<query, Array<sourceId>>>
const graph = {
  nodeIds: new Map(),
  nodesById: new Map(),
  linksBySource: new Map(),
  linksByTarget: new Map()
}

const getPaths = (o, visited = []) => {
  const unwrapped= managedMap.unwrap(nativeMap.unwrap(o)) 
  const id = graph.nodeIds.get(unwrapped)
  if (id === 0) { return 'root' }
  if (visited.includes(id)) { return `loop ${visited.indexOf(id)}` }
  return [...graph.linksByTarget.get(id).keys()].map(k => (
    { query: k, sources: graph.linksByTarget.get(id).get(k).map(s => getPaths(graph.nodesById.get(s), [id, ...visited])) }
  ))
}

const printPaths = (paths, chain = []) => {
  if ( typeof paths === 'string') {
    console.log(paths+'.'+chain.join('.'))
  } else {
    paths.forEach(p => {
      p.sources.forEach(s => printPaths(s, [p.query, ...chain]))
    })
  }
}

const printPathsForward = (ids = [0], chain = ['root'], visited = new Set()) => {
  ids.forEach((id,n) => {
      if (visited.has(id)) { return }
      const newChain = [...chain]
      newChain[newChain.length-1] = newChain[newChain.length-1]+`#${n+1}`

      const value = graph.nodesById.get(id)
      if (!(value instanceof Object || value === Object.prototype) ) {
        console.log(newChain.join('.'), value)
      } else {
        const targetsByQuery = graph.linksBySource.get(id);
        if (targetsByQuery) {
        [...targetsByQuery.keys()].forEach((query, n) => {
            const targets = targetsByQuery.get(query)
            printPathsForward(targets, [...newChain, query], (new Set(visited)).add(id))
            })
        }
      }
      })
}






const intern = (value) => {
  const unwrapped= managedMap.unwrap(nativeMap.unwrap(value)) 
  const id = graph.nodeIds.get(unwrapped)
  if (id !== undefined) { return id }
  const newId = graph.nodeIds.size
  graph.nodeIds.set(unwrapped, newId)
  graph.nodesById.set(newId, unwrapped)
  return newId
}

const addLinkBySource = (sourceId, query, targetId) => {
  graph.linksBySource.set(sourceId, graph.linksBySource.get(sourceId) || new Map())
  const source = graph.linksBySource.get(sourceId)
  source.set(query, source.get(query) || [])
  source.get(query).push(targetId)
}

const addLinkByTarget = (sourceId, query, targetId) => {
  graph.linksByTarget.set(targetId, graph.linksByTarget.get(targetId) || new Map())
  const target = graph.linksByTarget.get(targetId)
  target.set(query, target.get(query) || [])
  target.get(query).push(sourceId)
}

const addToGraph = (source, query, value) => {
  const sourceId = intern(source)
  const targetId = intern(value)
  addLinkBySource(sourceId, query, targetId)
  addLinkByTarget(sourceId, query, targetId)
}

const managedMap = indexedMap()
const nativeMap = indexedMap()

const { setHandler } = require('set-proxy')
const { mapHandler } = require('map-proxies')
const { arrayHandler } = require('array-proxy')

let externalCode = false
const handler0 = require('spy-property-writes').spyPropertyWrites((target, query, value, write) => {
  //if (externalCode) { write(value); return }
  if (value instanceof Object) {
    if (managedMap.isWrapper(value)) {
      const old = externalCode
      externalCode = true
      write(managedMap.unwrap(value))
      externalCode = old
      return 
    }
    // if the property being passed is not a managed input, then we track it as native output
    addToGraph(target, query, value)
    const newValue = wrapNative(value)
    const old = externalCode
    externalCode = true
    write(newValue)
    externalCode = old
  } else {
    const old = externalCode
    externalCode = true
    write(value)
    externalCode = old
  }
}, setHandler(mapHandler(arrayHandler())))
const handler02 = require('spy-property-reads').spyPropertyReads((target, query, getResult) => {
  const old = externalCode
  externalCode = true
  const value = getResult()
  externalCode = old
  //if (externalCode) { return value }
  if (value instanceof Object && !nativeMap.isWrapper()) { // We don't spy on native properties here
    addToGraph(target, query, value)
    const newValue = wrapManaged(value)
    return newValue
  }
  return value
}, handler0)

let internalCode = false
const handler1 = require('spy-property-writes').spyPropertyWrites((target, query, value, write) => {
  //if (internalCode) { write(value); return }
  if (value instanceof Object) {
    // if it is a wrapper to a native object then we unwrap it, it is safe to pass an unwrapped native object to
    // another unwrapped native object
    if (nativeMap.isWrapper(value)) {
      const old = internalCode
      internalCode = true
      write(nativeMap.unwrap(value))
      internalCode = old
      return 
    }
    // if what we are getting is not a native object, then we track it as managed input
    addToGraph(target, query, value)
    const newValue = wrapManaged(value)
    const old = internalCode
    internalCode = true
    write(newValue)
    internalCode = old
  } else {
    const old = internalCode
    internalCode = true
    write(value)
    internalCode = old
  }
}, setHandler(mapHandler(arrayHandler())))
const handler2 = require('spy-property-reads').spyPropertyReads((target, query, getResult) => {
  const old = internalCode
  internalCode = true
  const value = getResult()
  internalCode = old
  //if (internalCode) { return value }
  addToGraph(target, query, value)
  if (value instanceof Object && !managedMap.isWrapper()) { // We don't spy on property that are managed
    const newValue = wrapNative(value)
    return newValue
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

exports.printPathsForward = printPathsForward 

exports.spyPropertyReadsRecursive = o => {
  graph.nodeIds.set(o, 0)
  graph.nodesById.set(0, o)
  return wrapNative(o)
}
