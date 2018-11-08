const dns = require('dns');
const {promisify} = require('util');
const resolveDns = promisify(dns.resolve);

const request = require('request-promise-native');

const addressTool = require('./address_tool'); 

const burn_address = '1SAFEXg6ah1JqixuYUnEyKetC4hJhztoz';
const safex_backend = process.env.SAFEX_BACKEND || 'http://omni.safex.io:3002';

let globalApiBook = {};

async function fetchThns() {
  try {
    await resolveDns('bitcoin.safex.io');
  }
  catch (err) {
    throw new Error('No connection to bitcoin.safex.io');
  }
  
  console.log('Connected');
  
  let start_page = 0;
  
  const res = await request.get('http://bitcoin.safex.io:3001/insight-api/txs/?address=' + burn_address + '&pageNum=' + start_page, {
    json: true
  });
  
  var endpage = res.pagesTotal;
  
  console.log(endpage);
  
  let index = 0;
  const txns = [];
  
  while (index < endpage) {
    console.log(`fetching txns page ${index} of ${endpage}`);
    
    const page = await request.get('http://bitcoin.safex.io:3001/insight-api/txs/?address=' + burn_address + '&pageNum=' + index, {
      json: true
    });
    page.txs.forEach(tx => {
      if (tx.confirmations > 0) {
        txns.push(tx);
      }
    });
    index += 1;
  }
  
  return txns;
}

function extractAccountsFromTxns(txns, apibook) {
  const accounts = [];
  txns.forEach((tx) => {
    
    let duplicate = false;
    let index = 0;
    for (var x = 0; x < accounts.length; x++) {
      if (accounts[x].address === tx.vin[0].addr) {
        duplicate = true;
        index = x;
      }
    }
    
    if (apibook[tx.vin[0].addr] === undefined) {
      apibook[tx.vin[0].addr] = {};
      apibook[tx.vin[0].addr].address = tx.vin[0].addr;
    } else {
      
    }
    
    
    if (duplicate === true) {
      accounts[index].txns.push(tx);
    } else {
      const account = {};
      account.address = tx.vin[0].addr;
      account.txns = [tx];
      account.safex_addresses = [];
      account.migrated_balance = 0;
      accounts.push(account);
    }
    
  });
  
  return accounts;
}

async function processAccount(account, apiBook) {
  console.log('=========================**********************++++)))))))))))))))))))))))))))))))))');
  console.log(account.address);
  
  //collect first halves
  //collect second halves
  //run test against them match up by checksum
  //sort by blockheight
  
  account.first_halves = [];
  account.second_halves = [];
  account.burn_txns = [];
  account.migrated_balance = 0;
  
  console.log('entering account.txns.foreach loop');
  //analyze transactions here
  for (const txn of account.txns) {
    for (const out of txn.vout) {
      if (out.scriptPubKey.hex.slice(0, 2) === '6a' && out.scriptPubKey.hex.slice(4, 16) === '536166657831'
      ) {
        var first_half = {};
        
        first_half.key = out.scriptPubKey.hex.slice(16, 80);
        first_half.checksum = out.scriptPubKey.hex.slice(80, 88);
        first_half.blockheight = txn.blockheight;
        
        account.first_halves.push(first_half);
        
      } else if (out.scriptPubKey.hex.slice(0, 2) === '6a' && out.scriptPubKey.hex.slice(4, 16) === '536166657832') {
        
        var second_half = {};
        
        second_half.key = out.scriptPubKey.hex.slice(16, 80);
        second_half.checksum = out.scriptPubKey.hex.slice(80, 88);
        second_half.blockheight = txn.blockheight;
        
        account.second_halves.push(second_half);
        
      } else if (out.scriptPubKey.hex.slice(0, 2) === '6a' && out.scriptPubKey.hex.slice(4, 12) === '6f6d6e69') {
        const resp_json = await request.post(safex_backend + '/validate_transaction', {
          json: true,
          body: {txid: txn.txid},
        });
        
        if (!resp_json) {
          console.log('empty response on txid (could be a zero amount safex txn): ');
          console.log(txn.txid);
        } else {
          if (resp_json.valid === true &&
            resp_json.propertyid === 56 &&
            resp_json.confirmations > 1 &&
            resp_json.referenceaddress === burn_address
          ) {
            let burn_txn = {};
            burn_txn.amount = resp_json.amount;
            burn_txn.txid = resp_json.txid;
            burn_txn.blockheight = resp_json.block;
            account.burn_txns.push(burn_txn);
            
            account.migrated_balance += parseInt(resp_json.amount);
          }
        }
        //this will give you the balance of the migrated from this person
        //all of this info we need to keep in memory
      }
    }
  }
  
  console.log('burn txns ' + account.burn_txns.length);
  
  
  account.first_halves.sort((a, b) => {
    return a.blockheight - b.blockheight;
  });
  account.second_halves.sort((a, b) => {
    return a.blockheight - b.blockheight;
  });
  
  account.burn_txns.sort((a, b) => {
    return a.blockheight - b.blockheight;
  });
  
  const at = addressTool.create();
  
  for (let i = 0; i < account.first_halves.length; i++) {
    
    for (let j = 0; j < account.second_halves.length; j++) {
      
      let addresses = account.safex_addresses;
      
      if (account.first_halves[i].checksum === account.second_halves[j].checksum) {
        const safex_address = await at.pubkeys_to_string(account.first_halves[i].key, account.second_halves[j].key);
        const newsum = await at.address_checksum(account.first_halves[i].key, account.second_halves[j].key);
        if (newsum === account.first_halves[i].checksum && newsum === account.second_halves[j].checksum) {
          let safexaddress = {};
          safexaddress.address = safex_address;
          safexaddress.checksum = newsum;
          safexaddress.blockheight1 = account.first_halves[i].blockheight;
          safexaddress.blockheight2 = account.second_halves[j].blockheight;
          safexaddress.balance = 0;
          safexaddress.burns = [];
          if (account.safex_addresses.length === 0) {
            account.safex_addresses.push(safexaddress);
            console.log('breaking loop first match found ');
            break;
          } else {
            var duplicate_flag = false;
            
            for (var z = 0; z < addresses.length; z++) {
              if (safexaddress.checksum === addresses[z].checksum &&
                safexaddress.blockheight1 === addresses[z].blockheight1 &&
                safexaddress.blockheight2 === addresses[z].blockheight2) {
                
                console.log('ignore duplicate');
                duplicate_flag = true;
                break;
                
              } else if (safexaddress.blockheight1 > addresses[addresses.length - 1].blockheight1 &&
                safexaddress.blockheight2 > addresses[addresses.length - 1].blockheight2) {
                account.safex_addresses.push(safexaddress);
                console.log('breaking loop now both blockheights are greater match found ');
                duplicate_flag = true;
                break;
              }
              
            } //for loop ened
            if (duplicate_flag === true) {
              break;
            }
          }
        }
      }
    }
  }
  
  at.destroy();
  
  console.log(' number of safex addresses ' + account.safex_addresses.length);
  
  
  if (account.safex_addresses.length > 0) {
    
    account.safex_addresses.sort((a, b) => {
      return a.blockheight1 - b.blockheight1;
    });
    
    console.log(account.safex_addresses);
    
    
    //iterate over the burn transactions for the account
    //check their highest lower blockheight address in the series of transactions
    account.burn_txns.forEach(burn => {
      console.log(burn.blockheight);
      
      if (account.safex_addresses.length === 1) {
        account.safex_addresses[0].burns.push(burn);
        account.safex_addresses[0].balance += parseInt(burn.amount);
        console.log('one address balance ' + account.safex_addresses[0].balance);
      } else {
        let bottom = 0;
        let addy;
        let index = 0;
        for (var i = 0; i < account.safex_addresses.length; i++) {
          if (account.safex_addresses[i].blockheight1 <= burn.blockheight &&
            account.safex_addresses[i].blockheight2 <= burn.blockheight &&
            bottom === 0) {
            
            bottom = account.safex_addresses[i].blockheight1;
            addy = account.safex_addresses[i];
            index = i;
            
          } else if (account.safex_addresses[i].blockheight1 <= burn.blockheight &&
            account.safex_addresses[i].blockheight2 <= burn.blockheight &&
            bottom < account.safex_addresses[i].blockheight1) {
            
            bottom = account.safex_addresses[i].blockheight1;
            addy = account.safex_addresses[i];
            index = i;
          }
          
          
        }
        if (bottom === 0) {
          account.safex_addresses[0].burns.push(burn);
          account.safex_addresses[0].balance += parseInt(burn.amount);
          console.log('added bottom 0 found by block address balance ' + account.safex_addresses[0].balance);
        }
        if (bottom <= burn.blockheight) {
          if (account.safex_addresses[index].blockheight1 === bottom) {
            account.safex_addresses[index].burns.push(burn);
            account.safex_addresses[index].balance += parseInt(burn.amount);
            console.log('found by block address balance ' + account.safex_addresses[index].balance);
          }
        }
      }
    });
  }
  
  
  apiBook[account.address].safex_addresses = [];
  
  
  apiBook[account.address].migrated_balance = 0;
  
  for (var i = 0; i < account.safex_addresses.length; i++) {
    
    var add_add = {};
    add_add.safex_address = account.safex_addresses[i].address;
    var amount = 0;
    
    
    for (var j = 0; j < account.safex_addresses[i].burns.length; j++) {
      
      console.log(account.safex_addresses[i].address);
      console.log(account.safex_addresses[i].burns[j].txid);
      amount += parseInt(account.safex_addresses[i].burns[j].amount);
      
    }
    
    add_add.balance = amount;
    
    apiBook[account.address].migrated_balance += amount;
    
    apiBook[account.address].safex_addresses.push(add_add);
    console.log(account.safex_addresses[i].balance);
    
  }
  
  console.log('=========================**********************++++)))))))))))))))))))))))))))))))))');
}

function printApiBook(apiBook) {
  Object.keys(apiBook).map((key, index) => {
    console.log(apiBook[key].address);
    if (apiBook[key].safex_addresses.length > 0) {
      for (var i = 0; i < apiBook[key].safex_addresses.length; i++) {
        
        console.log(apiBook[key].safex_addresses[i].safex_address);
        console.log(apiBook[key].safex_addresses[i].balance);
      }
    }
  });
}

let executing = false;

async function execute() {
  // 1 fetch all data
  // 2 extract all senders -- get the address that sent it and pack it into an object
  // store Safex1
  // store Safex2
  // store SAFEX transactions
  // check order by block height
  
  if (executing) {
    console.error('Already executing, waiting for next turn');
    return;
  }
  
  executing = true;
  
  try {
    const txns = await fetchThns();
    console.log('Thns count:', txns.length);
    
    const nextApiBook = {};
    
    const accounts = extractAccountsFromTxns(txns, nextApiBook);
    console.log('how many different senders ' + accounts.length);
    
    for (const account of accounts) {
      await processAccount(account, nextApiBook);
    }
    
    globalApiBook = nextApiBook;
    
    printApiBook(globalApiBook);
  }
  catch (err) {
    console.error(err);
  }
  finally {
    executing = false;
  }
}

function getApiBook() {
  return globalApiBook;
}

function startDaemon(interval) {
  interval = interval || (5 * 60 * 1000);
  setInterval(execute, interval);
  // Execute once immediately at start
  setTimeout(execute, 1000);
}

module.exports = {
  startDaemon,
  getApiBook
};