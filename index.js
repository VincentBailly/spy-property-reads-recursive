
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
  linksByTarget: new Map(),
  path: new Map()
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

// TODO: finish this
const assignShortestPath = (ids = [0], chain = ['root[']) => {
  ids.forEach((id, n) =>  {
      if (graph.path.has(id)) {
        return
      }
      const newChain = [...chain]
      newChain[newChain.length-1] = newChain[newChain.length-1]+`#${n+1}`
      graph.set(id, newChain)
        const targetsByQuery = graph.linksBySource.get(id);
        if (targetsByQuery) {
        [...targetsByQuery.keys()].forEach((query, n) => {
            const targets = targetsByQuery.get(query)
            assignShortestPath(targets, [...newChain, query])
            })
        }
      })
}



const memo = new Map()
const printPathsForward = (ids = [0], chain = ['root'], visited = new Set()) => {
  ids.forEach((id,n) => {
      if (visited.has(id)) { return }
      const newChain = [...chain]
      newChain[newChain.length-1] = newChain[newChain.length-1]+`#${n+1}`

      const value = graph.nodesById.get(id)
      if (!(value instanceof Object || value === Object.prototype) ) {
        console.log(newChain.join('.'), value)
      } else {
        if (memo.has(id) && value instanceof Object && !(value === Object.prototype)) {
          console.log(`these are the same objects: ${newChain.join('.')} and ${memo.get(id).join('.')}`)
          return
        }
        memo.set(id, newChain)
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

const handler1 = require('spy-property-writes').spyPropertyWrites((target, query, value, write) => {
  if (value instanceof Object) {
    const newValue = wrapWrites(target, value, query)
    write(newValue)
  } else {
    if (managedMap.isWrapped(target)) {
      addToGraph(target, query, value)
    }
    write(value)
  }
}, setHandler(mapHandler(arrayHandler())))
const handler2 = require('spy-property-reads').spyPropertyReads((target, query, getResult) => {
    if (query === 'get("__target")') {
      return target
    }
    if (query === 'get("isProxy")') {
    return true
    }
  const value = getResult()
  if (value instanceof Object) {
    addToGraph(target, query, value)
    const newValue = wrapReads(target, value)
    return newValue
  }
  if (nativeMap.isWrapped(target)) {
    addToGraph(target, query, value)
  }
  return value
}, handler1)

const wrapReads = (parent, value) => {
  const parentType = nativeMap.isWrapper(parent) || nativeMap.isWrapped(parent) ? 'native' : 'managed'
  const valueType = nativeMap.isWrapper(value) || nativeMap.isWrapped(value) ? 'native' :
                   managedMap.isWrapper(value) || managedMap.isWrapped(value) ? 'managed' : 'new'
  if (parentType === 'native') {
    if (valueType === 'native') {
      return getNative(value) // We simply wrap the read object as native if it was not already wrapped
    }
    if (valueType === 'managed') {
      return getManaged(value) // We simply wrap the read object as managed if it was not already wrapped
    }
    return wrapNative(value)
  } else { // parent is managed
    if (valueType === 'native') {
      return getNative(value) // We simply wrap the read object as native if it was not already wrapped
    }
    if (valueType === 'managed') {
      return getManaged(value) // We simply wrap the read object as managed if it was not already wrapped
    }
    return wrapManaged(value)
  }
}

const wrapWrites = (parent, value, query) => {
  const parentType = nativeMap.isWrapper(parent) || nativeMap.isWrapped(parent) ? 'native' : 'managed'
  const valueType = nativeMap.isWrapper(value) || nativeMap.isWrapped(value) ? 'native' :
                   managedMap.isWrapper(value) || managedMap.isWrapped(value) ? 'managed' : 'new'
  if (parentType === 'native') {
    if (valueType === 'native') {
      return nativeMap.unwrap(value) // native gets access to other native objects
    }
    if (valueType === 'managed') {
      addToGraph(parent, query, value)
      return getManaged(value) // We simply wrap the read object as managed if it was not already wrapped
    }
    addToGraph(parent, query, value)
    return wrapManaged(value)
  } else { // parent is managed
    if (valueType === 'native') {
      addToGraph(parent, query, value)
      return getNative(value) // We simply wrap the read object as native if it was not already wrapped
    }
    if (valueType === 'managed') {
      return managedMap.unwrap(value) // Managed objects can freely get other managed objects
    }
    addToGraph(parent, query, value)
    return wrapNative(value)
  }
}


const getManaged = (o) => {
  return managedMap.isWrapper(o) ? o : managedMap.getWrapper(o)
}
const getNative = (o) => {
  return nativeMap.isWrapper(o) ? o : nativeMap.getWrapper(o)
}

const wrapNative = o => {
  //o['__type'] = 'native'
  const newValue = new Proxy(o, handler2)
  nativeMap.setWrapped(o, newValue)
  return newValue
} 
const wrapManaged = o => {
  //o['__type'] = 'managed'
  const newValue = new Proxy(o, handler2)
  managedMap.setWrapped(o, newValue)
  return newValue
} 

exports.printPathsForward = printPathsForward 

exports.spyPropertyReadsRecursive = o => {
  graph.nodeIds.set(o, 0)
  graph.nodesById.set(0, o)
  return wrapNative(o)
}
