const fork = require('child_process').fork;

function create() {
  const child = fork(__filename);
  
  let _lastMessageId = 0;
  let _promisesById = {};
  
  child.on('message', ({id, result, error}) => {
    if (_promisesById[id]) {
      console.log(`Address tool [${id}] <-- ${result}`);
      if (error) {
        _promisesById[id].reject(error);
      } else {
        _promisesById[id].resolve(result);
      }
      delete _promisesById[id];
    }
  });
  
  const addressTool = {
    pubkeys_to_string: (spend, view) => {
      return wrap('pubkeys_to_string', [spend, view]);
    },
    address_checksum: (spend, view) => {
      return wrap('address_checksum', [spend, view]);
    },
    destroy: () => {
      child.kill();
    }
  };
  
  return addressTool;
  
  function wrap(method, args) {
    const id = ++_lastMessageId;
    console.log(`Address tool [${id}] --> ${method}(${args.join(', ')})`);
    const promiseMethods = {};
    const promise = new Promise((resolve, reject) => {
      promiseMethods.resolve = resolve;
      promiseMethods.reject = reject;
    });
    _promisesById[id] = promiseMethods;
    child.send({id, method, args});
    return promise;
  }
}

function initChild() {
  const sa = require('safex-addressjs');
  
  process.on('message', ({id, method, args}) => {
    const result = sa[method](...args);
    process.send({id, result});
  });
}

if (process.send) {
  // This is a child
  initChild();
} else {
  // This is used as a module
  module.exports = {
    create
  };
}