'use strict';

/*
 * Created with @iobroker/create-adapter v1.24.2
 */

const utils = require('@iobroker/adapter-core');
const fetch = require('node-fetch');
const { URLSearchParams } = require('url');


class HusqvarnaAutomowerApi extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'husqvarna-automower-api',
		});
		this.on('ready', this.onReady.bind(this));
		//this.on('objectChange', this.onObjectChange.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}



	sleep(milliseconds) {
		return new Promise(resolve => setTimeout(resolve, milliseconds));
	}


	//TODO: timestamp if needed
	/*gettime() {
		const date = new Date();
		const actualTime = date.getTime() - date.getTimezoneOffset() * 60000;
		return actualTime;
	}*/


	// OK
	//Login with username and password to get new accessToken and refreshToken
	async login() {
		const params = new URLSearchParams();
		params.set('grant_type', 'password');
		params.set('client_id', this.config.app_key);
		params.set('username', this.config.username);
		params.set('password', this.config.password);

		const res = await fetch('https://api.authentication.husqvarnagroup.dev/v1/oauth2/token', {
			method: 'POST',
			body: params
		});

		if (!res.ok) {
			this.log.error('Login with username and password FAILED. html status:  ' + res.status + '     text: ' + res.statusText);
			throw new Error(res.statusText);
		} else {
			const result = await res.json();
			this.log.info('Got new accessToken from API: ' + result.access_token);
			this.log.info('Got new refreshToken from API: ' + result.refresh_token);
			return result;
		}

	};


	// OK
	//login with RefreshToken and get new accessToken
	async requestNewAccessToken(appKey) {
		const params = new URLSearchParams();
		let refreshToken = await this.getStateAsync('keys.refreshToken');
		refreshToken = refreshToken.val;

		params.set('grant_type', 'refresh_token');
		params.set('client_id', appKey);
		params.set('refresh_token', refreshToken);

		const res = await fetch('https://api.authentication.husqvarnagroup.dev/v1/oauth2/token', {
			method: 'POST',
			body: params
		});

		if (!res.ok) {
			throw new Error(res.statusText);
			this.log.error("Error logging in with refresh key to get new accessKey: " + res.statusText);
			//TODO maybe login with username and password
		}
		const tk = await res.json();
		this.log.info('requested new accessToken from API: ' + tk.access_token);
		await this.setStateAsync('keys.accessToken', {val: tk.access_token, ack: true});
	}


	// OK
	//call this to get the mower data from the API
	async requestMowerStatus() {
			this.log.info('trying to get mower data from API...');
			let accessToken = await this.getStateAsync('keys.accessToken');
			accessToken = accessToken.val;
			let appKey = this.config.app_key;
			const mowerResponse = await fetch(`https://api.amc.husqvarna.dev/v1/mowers/`, {//+ this.config.mower_ID, { //${mowerId}`, {
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'X-Api-Key': appKey,
					'Authorization-Provider': 'husqvarna'
				}
			});
			if (mowerResponse.ok) {
				this.log.info('requestMowerStatus: htmlstatus ' + mowerResponse.status + '   statustext: ' + mowerResponse.statusText);
				const json = await mowerResponse.json();
				let mowerdata = json.data;
				for (let mower in mowerdata) {
					await this.extractMowerData(mowerdata[mower], 'mower.' + mower + '.');
				};
				this.log.info('mower data request successful');
			} else {
				this.log.error('requesting data from API with accessToken FAILED. htmlstatus: ' + mowerResponse.status + '   statustext: ' + mowerResponse.statusText);
				this.log.error('trying to get new token and repeat request ...');
				//this.sleep(2000);
				accessToken = await this.requestNewAccessToken(appKey);
				await this.setObjectNotExistsAsync('keys.accessToken', {
					type: 'state',
					common: {
						name: 'accessToken',
						type: 'string',
						role: 'text'
					},
					native: {}
				});
				await this.setStateAsync('keys.accessToken', {val: accessToken, ack: true});
				await this.requestMowerStatus();
			}
	}


	// OK
	//Extract mower data and write them to the objects
	async extractMowerData(obj, indent) {
		for (const i in obj) {
			if (Array.isArray(obj[i]) || typeof obj[i] === 'object') {
				this.extractMowerData(obj[i], indent + i + ".");

			} else {
				const setObj = await indent;
				const setStateVal = await obj[i];
				const type = typeof (setStateVal);
				await this.setObjectNotExistsAsync(setObj + i, {
					type: 'state',
					common: {
						name: 'name',
						type: 'string',
						role: 'text'
					},
					native: {}
				});
				await this.setStateAsync(setObj + i, {val: setStateVal, ack: true});
			}
		}
	}


	//****  TODO ****
	//Send commands to API
	async sendCommand(command){
		//TODO
	}


	async onReady() {

		// OK
		//reading from config
		let appKey = this.config.app_key;
		let refreshTime;
		let refreshToken;
		let accessToken;

		this.log.info('starting Husqvarna Automower adapter ...');


		// OK
		//create objects for keys
		await this.setObjectNotExistsAsync('keys.accessToken', {
			type: 'state',
			common: {
				name: 'accessToken',
				type: 'string',
				role: 'text'
			},
			native: {}
		});

		await this.setObjectNotExistsAsync('keys.refreshToken', {
			type: 'state',
			common: {
				name: 'refreshToken',
				type: 'string',
				role: 'text'
			},
			native: {}
		});

		await this.setObjectNotExistsAsync('commands.activity', {
			type: 'state',
			common: {
				name: 'activity',
				type: 'string',
				role: 'text'
			},
			native: {}
		});


		// OK
		//Checking requirements username, password, appKey
		if (this.config.username === '' || this.config.password === '' || this.config.appKey === '') {
			this.log.error('Username, password and appKey are required! Quiting Adapter');
			this.setForeignState('system.adapter.husqvarna-automower-api.0.alive', false);
			await this.sleep(2000);
		}


		// OK
		//get and set refreshTime for data request
		if (this.config.refresh_time.replace(/,/g, '.') < 1 ||  this.config.refresh_time === null ){
			refreshTime = 5*60000;//set to 5 minutes
			this.log.info('no refresh time for the mower data request was found or is less than 1');
			this.log.info('refresh time for the mower data is set to 5 minutes');
		} else {
			refreshTime= this.config.refresh_time.replace(/,/g, '.') * 60000;
		}


		// OK
		//Checking and getting new refreshToken and new accessToken
		//TODO: if refreshToken is invalid???
		const rf_Token =  await this.getStateAsync('keys.refreshToken');
		if (rf_Token === null) {
			this.log.error('no refresh token found. Trying to get new one ...');
			let newToken = await this.login();
			accessToken = newToken.access_token;
			refreshToken = newToken.refresh_token;
			await this.setStateAsync('keys.refreshToken', {val: refreshToken, ack: true});
			await this.setStateAsync('keys.accessToken', {val: accessToken, ack: true});
			await this.sleep(1000);
		}
		else {
			refreshToken = rf_Token.val;
			this.log.info('found existing refresh token in objects: ' + refreshToken);
		}


		// OK
		//Checking and getting new accessToken
		const ac_Token = await this.getStateAsync('keys.accessToken');
		if (ac_Token === null) {
			this.log.error('no access token found. Trying to get new one ...');
			await this.requestNewAccessToken(appKey);
			await this.sleep(1000);
			await this.requestMowerStatus();
			await this.sleep(1000);
		}
		else {
			accessToken = ac_Token.val;
			this.log.info('found existing access token in objects: ' + accessToken);
			await this.requestMowerStatus();
		}


		// OK *** TODO: check if really unnecessary
		//Setting timer for requesting accessToken
		//setInterval(async () => {await this.requestNewAccessToken(appKey)}, 55*60000);
		//this.log.info('refresh accessToken timer is set to 55 minutes.');
		// ************************************


		// OK
		// Getting data from API
		setInterval(async () => {await this.requestMowerStatus()}, refreshTime);
		this.log.info('request mower data timer is set to ' + refreshTime/60000 + ' minutes');


		// in this template all states changes inside the adapters namespace are subscribed
		this.subscribeStates('commands.activity');

	}


	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.info('cleaned everything up...');
			callback();
		} catch (e) {
			callback();
		}
	}


	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			// same thing, but the state is deleted after 30s (getState will return null afterwards)
			//await this.setStateAsync('testVariable', { val: true, ack: true, expire: 30 });
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

}


// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new HusqvarnaAutomowerApi(options);
} else {
	// otherwise start the instance directly
	new HusqvarnaAutomowerApi();
}