const RateLimit = require('express-rate-limit');
const express = require('express');

const extractor = require('./extractor');

var app = express();

var ratelimit = new RateLimit({
  windowMs: 60 * 60 * 1000 * 2, // 6 hour window
  delayAfter: 40, // begin slowing down responses after the third request
  delayMs: 3 * 1000, // slow down subsequent responses by 3 seconds per request
  max: 100, // start blocking after 10 requests
  message: 'Too many accounts created from this IP, please try again after an hour'
});

let router = express.Router();

router.post('/:account', ratelimit, (req, res) => {
  
  const account = req.params.account;
  
  const apiBook = extractor.getApiBook();
  
  if (apiBook[account] !== undefined) {
    console.log('we found your account');
    res.status(200).json(apiBook[account]);
    //simply reply with the apibook info for this account
  } else {
    //we couldnt find it sorry
    console.log('no account found here');
    res.status(200).json({error: 'no account found by this address'});
  }
  
});

app.use('/api', router);

app.listen(3010);

extractor.startDaemon(process.env.EXTRACTOR_INTERVAL);