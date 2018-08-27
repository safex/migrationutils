extern crate iron;
extern crate serde;
extern crate serde_json;

#[macro_use]
extern crate serde_derive;


extern crate router;

use router::Router;
use iron::prelude::*;
use iron::{status, headers};
use iron::method::Method;
use iron::modifiers::Header;

use std::io::Read;
use std::process::Command;



#[derive(Debug, Deserialize, Serialize)]
struct TxId {
	txid: String
}

#[derive(Debug, Deserialize, Serialize)]
struct OmniTransaction {
	#[serde(rename = "type")]
	type_type: String,
	txid: String,
	fee: String,
	sendingaddress: String,
	referenceaddress: String,
	ismine: bool,
	version: i32,
	type_int: i32,
	propertyid: i32,
	divisible: bool,
	amount: String,
	valid: bool,
	blockhash: String,
	blocktime: u64,
	positioninblock: u64,
	block: u64,
	confirmations: u64,
}



fn main() {

	println!("starting up router...");
	let mut router = Router::new();

	println!("started!");
	router.post("/validate_transaction", move |r: &mut Request| validate_transaction(r), "validate_transaction");


	fn validate_transaction(req: &mut Request) -> IronResult<Response> {
		let mut payload = String::new();
		println!("we're here");
		req.body.read_to_string(&mut payload).unwrap();
		println!("payload received {:?}", &payload);

		let txid: TxId = serde_json::from_str(&payload).unwrap();
		let transaction = Command::new("omnicore-cli").arg("omni_gettransaction").arg(txid.txid).output().expect("failed");

		let mut s = String::from_utf8(transaction.stdout).unwrap();
    	s.pop();

		let mut response = Response::with((status::Ok, s));
		response.set_mut(Header(headers::AccessControlAllowOrigin::Any));	
		response.set_mut(Header(headers::AccessControlAllowMethods(vec![Method::Post])));					
		Ok(response)

	}

	
	
	Iron::new(router).http("localhost:3002").unwrap();
}
