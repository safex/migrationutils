const express = require('express');

const app = express();

app.use(express.json());

const burn_address = "1SAFEXg6ah1JqixuYUnEyKetC4hJhztoz";

let lastTxId = 9564533633;
let lastBlockHeight = 4234325;

app.post('/validate_transaction', (req, res) => {
  const txid = req.body.txid;
  const resp = {
    valid: true,
    propertyid: 56,
    confirmations: 2,
    referenceaddress: burn_address,
    amount: '123.456',
    txid: String(++lastTxId),
    block: (lastBlockHeight += 100)
  };
  
  console.log(`${txid} -> ${JSON.stringify(resp)}`);
  
  return res.send(resp);
});

app.listen(3002);