'use strict';

/*
 * Created with @iobroker/create-adapter v1.24.2
 */
const HusqvarnaApi = require('./lib/HusqvarnaAPI');
const utils = require('@iobroker/adapter-core');
const { URLSearchParams } = require('url');

const HusqApi = new HusqvarnaApi();

let start_duration;
let park_duration;
let refreshTime;
let mowerStatus;


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


	//OK
	//Password decryption
	async decrypt(key, value) {
		let result = "";
		for (let i = 0; i < value.length; ++i) {
			result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
		}
		this.log.info("Password decrypt ready");
		return result;
	}


	sleep(milliseconds) {
		return new Promise(resolve => setTimeout(resolve, milliseconds));
	}


	// OK
	//create objects
	async createObjects(){
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

		await this.setObjectNotExistsAsync('commands.MowerNumber', {
			type: 'state',
			common: {
				name: 'Number of the mower for the API',
				type: 'number',
				role: 'number'
			},
			native: {}
		});

		await this.setStateAsync('commands.MowerNumber', {val: 0, ack: true});

		await this.setObjectNotExistsAsync('commands.StartDuration', {
			type: 'state',
			common: {
				name: 'Duration for start in hours',
				type: 'number',
				role: 'number'
			},
			native: {}
		});

		await this.setObjectNotExistsAsync('commands.ParkDuration', {
			type: 'state',
			common: {
				name: 'Duration for parking in hours',
				type: 'number',
				role: 'number'
			},
			native: {}
		});

		await this.setObjectNotExistsAsync('commands.PauseMower', {
			type: 'state',
			common: {
				name: 'Pause mower',
				//type: 'string',
				role: 'button'
			},
			native: {}
		});

		await this.setObjectNotExistsAsync('commands.ParkUntilNextSchedule', {
			type: 'state',
			common: {
				name: 'Park mower until next scheduled run',
				//type: 'string',
				role: 'button'
			},
			native: {}
		});

		await this.setObjectNotExistsAsync('commands.ParkUntilFurtherNotice', {
			type: 'state',
			common: {
				name: 'Park mower until further notice, overriding schedule',
				//type: 'string',
				role: 'button'
			},
			native: {}
		});

		await this.setObjectNotExistsAsync('commands.ParkForDuration', {
			type: 'state',
			common: {
				name: 'Park mower for a duration of time, overriding schedule',
				//type: 'string',
				role: 'button'
			},
			native: {}
		});

		await this.setObjectNotExistsAsync('commands.ResumeSchedule', {
			type: 'state',
			common: {
				name: 'Resume mower according to schedule',
				//type: 'string',
				role: 'button'
			},
			native: {}
		});

		await this.setObjectNotExistsAsync('commands.StartForDuration', {
			type: 'state',
			common: {
				name: 'Start mower and cut for a duration of time, overriding schedule',
				//type: 'string',
				role: 'button'
			},
			native: {}
		});

		await this.setObjectNotExistsAsync('commands.RequestMowerData', {
			type: 'state',
			common: {
				name: 'Request mower data manually',
				//type: 'string',
				role: 'button'
			},
			native: {}
		});
	}


	// OK
	//get and set refreshTime for data request
	async setStatesFromConfig(){

		if (this.config.refresh_time.replace(/,/g, '.') < 1 ||  this.config.refresh_time === null ){
			refreshTime = 5*60000;//set to 5 minutes
			this.log.info('no refresh time for the mower data request was found or is less than 1');
			this.log.info('refresh time for the mower data is set to default: 5 minutes');
		} else {
			refreshTime= this.config.refresh_time.replace(/,/g, '.') * 60000;
		}

		// OK
		//get and set start_duration
		if (this.config.start_duration === "" || this.config.start_duration === null || this.config.start_duration < 0) {
			await this.setStateAsync('commands.StartDuration', {val: '3', ack: true});
			this.log.info('StartDuration is set to default: 3 hours');
		} else {
			start_duration = this.config.start_duration;
			await this.setStateAsync('commands.StartDuration', {val: start_duration, ack: true});
			this.log.info('StartDuration is set to ' + start_duration  + ' hours');
		}

		// OK
		//get and set park_duration
		if (this.config.park_duration === "" || this.config.park_duration === null || this.config.park_duration < 0) {
			await this.setStateAsync('commands.ParkDuration', {val: '3', ack: true});
			this.log.info('ParkDuration is set to default: 3 hours');
		} else {
			park_duration = this.config.park_duration;
			await this.setStateAsync('commands.ParkDuration', {val: park_duration, ack: true});
			this.log.info('ParkDuration is set to ' + park_duration  + ' hours');
		}

		HusqApi.username = this.config.username;
		HusqApi.password = this.config.password;
		HusqApi.appKey = this.config.appKey;
	}


	// OK
	// request mower data from API and write to object
	async requestAndWriteMowerData(){

		try {
			this.log.info('requesting mower data ...');
			mowerStatus = await HusqApi.requestMowerStatus();
			for (let mower in mowerStatus.data) {
				await this.extractMowerDataFromJSON(mowerStatus.data[mower], 'mower.' + mower + '.');
			}
			this.log.info('new mower data written in objects');
		}
		catch (e) {
			this.log.info(e.message);
			this.log.info('requesting new accessToken ...');
			await HusqApi.requestNewAccessToken();
			this.log.info('new accessToken: ' + HusqApi.accessToken);
			await this.setStateAsync('keys.accessToken', {val: HusqApi.accessToken, ack: true});

			this.log.info('requesting mower data ...');
			mowerStatus = await HusqApi.requestMowerStatus();
			for (let mower in mowerStatus.data) {
				await this.extractMowerDataFromJSON(mowerStatus.data[mower], 'mower.' + mower + '.');
			}
			this.log.info('requested new mower data');
			//TODO RF token invalid???
		}
	}


	// OK
	//Extract mower data and write them to the objects
	async extractMowerDataFromJSON(obj, indent) {
		for (const i in obj) {
			if (Array.isArray(obj[i]) || typeof obj[i] === 'object') {
				this.extractMowerDataFromJSON(obj[i], indent + i + ".");

			} else {
				const setObj = await indent;
				const setStateVal = await obj[i];
				const type = typeof (setStateVal);
				await this.setObjectNotExistsAsync(setObj + i, {
					type: 'state',
					common: {
						name: 'name',
						type: 'string', //type??
						role: 'text'
					},
					native: {}
				});
				await this.setStateAsync(setObj + i, {val: setStateVal, ack: true});
			}
		}
	}


	/*
        //TODO: timestamp if needed
        async actualTime(){
            const date = new Date();
            const actualTime = date.getTime() - date.getTimezoneOffset() * 60000;
            return actualTime;
        }

     */


	async onReady() {

		this.log.info('starting Husqvarna Automower adapter ...');

		//OK
		//Decrypt password
		this.getForeignObject("system.config", (err, obj) => {
			if (obj && obj.native && obj.native.secret) {
				//noinspection JSUnresolvedVariable
				this.config.password = this.decrypt(obj.native.secret, this.config.password);
			} else {
				//noinspection JSUnresolvedVariable
				this.config.password = this.decrypt("Zgfr56gFe87jJOM", this.config.password);
			}
		})


		// OK
		//Checking requirements: username, password, appKey
		if (this.config.username === '' || this.config.password === '' || this.config.appKey === '') {
			this.log.error('Username, password AND appKey are required! Exiting adapter');
			this.setForeignState("system.adapter." + this.namespace + ".alive", false); //stop instance
			this.sleep(2000);
		}


		//Check if objects are existing - if not, create them
		await this.createObjects();


		//read states from config and set objects
		await this.setStatesFromConfig();


		// OK
		//Check and/or get new refreshToken and new accessToken
		const rf_Token =  await this.getStateAsync('keys.refreshToken');

		if (rf_Token.val === null) {
			this.log.info('no refresh token found. Trying to get new one with login data ...');
			try {
				await HusqApi.login();
			}
			catch(e) {
				this.log.error(e.message);
				this.log.error('Exiting Adapter! Please check error message!');
				this.setForeignState("system.adapter." + this.namespace + ".alive", false); //stop instance
				await this.sleep(2000);
			}

			await this.setStateAsync('keys.refreshToken', {val: HusqApi.refreshToken, ack: true});
			this.log.info('new accessToken: '+ HusqApi.accessToken);

			await this.setStateAsync('keys.accessToken', {val: HusqApi.accessToken, ack: true});
			this.log.info('new refreshToken:' + HusqApi.refreshToken);

			await this.sleep(1000);
		}
		else {
			HusqApi.refreshToken = rf_Token.val;
			this.log.info('found existing refresh token in objects: ' + HusqApi.refreshToken);
		}


		// OK
		//Check and/or get new accessToken
		const ac_Token = await this.getStateAsync('keys.accessToken');
		if (ac_Token.val === null) {
			this.log.error('no access token found. Trying to get new one ...');
			try {
				await HusqApi.requestNewAccessToken();
			}
			catch (e) {
				this.log.info(e.message);
				this.log.error('Error logging in ...');
				//TODO what now???? exit? call login() again??
			}

			await this.setStateAsync('keys.accessToken', {val: HusqApi.accessToken, ack: true});
			this.log.info('new accessToken: ' + HusqApi.accessToken);
			await this.sleep(1000);

		} else {
			HusqApi.accessToken = ac_Token.val;
			this.log.info('found existing access token in objects: ' + HusqApi.accessToken);
		}


		// OK
		// request mower data from API and write to objects
		await this.requestAndWriteMowerData();


		// OK
		// set interval for periodic data request from API
		if (this.config.enable_requests) {
			setInterval(async () => {
				await this.requestAndWriteMowerData()
			}, refreshTime);
			this.log.info('request mower data timer is set to ' + refreshTime / 60000 + ' minutes');
		} else
		{
			setInterval(async () => {
				await this.requestAndWriteMowerData()
			}, 1000*3600*24);
			this.log.info('periodic mower data request ist DISABLED');
			this.log.info('Connect to API every 24 hours to keep refresh key up to date.');
		}


		// all states changes inside commands object are subscribed
		this.subscribeStates('commands.*');

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
	async onStateChange(id, state) {
		if (state) {
			let type ={};
			let mower = await this.getStateAsync('commands.MowerNumber');
			mower = Number(mower.val);
			let mowerId = await this.getStateAsync('mower.' + mower + '.id');
			mowerId = mowerId.val;
			let parkDuration = await this.getStateAsync('commands.ParkDuration');
			parkDuration = Number(parkDuration.val);
			let startDuration = await this.getStateAsync('commands.StartDuration');
			startDuration = Number(startDuration.val);

			switch (id) {
				case this.namespace + ".commands.ParkDuration": //Changes in 'ParkDuration' object will be ignored
					return;
				case this.namespace + ".commands.StartDuration": //Changes in 'StartDuration' object will be ignored
					return;
				case this.namespace + ".commands.MowerNumber": //Changes in 'MowerNumber' object will be ignored
					return;
				case this.namespace + ".commands.PauseMower"://Pause mower
					type = {
						data: {
							type: 'Pause'
						}
					};
					break;
				case this.namespace + ".commands.ParkUntilNextSchedule": //Park mower until next scheduled run
					type = {
						data: {
							type: 'ParkUntilNextSchedule'
						}
					};
					break;
				case this.namespace + ".commands.ParkUntilFurtherNotice": //Park mower until further notice, overriding schedule
					type = {
						data: {
							type: 'ParkUntilFurtherNotice'
						}
					};
					break;
				case this.namespace + ".commands.ParkForDuration": // Park mower for a duration of time, overriding schedule
					type = {
						data: {
							type: 'Park',
							attributes: {
								duration: parkDuration
							}
						}
					};
					break;
				case this.namespace + ".commands.ResumeSchedule": //Resume mower according to schedule
					type = {
						data: {
							type: 'ResumeSchedule'
						}
					};
					break;
				case this.namespace * ".commands.StartForDuration": //Start mower and cut for a duration of time, overriding schedule
					type = {
						data: {
							type: 'Start',
							attributes: {
								duration: startDuration
							}
						}
					};
					break;
				case this.namespace + ".commands.RequestMowerData":
					await this.requestAndWriteMowerData();
					return;
			}
			try {
				this.log.info('Sending command to API ... ');
				let answer = await HusqApi.sendCommand(mowerId, type);
				this.log.info(answer);
				//this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
			}
			catch (e) {
				this.log.error(e.message);
				this.log.info('Trying to get new accessToken ...');
				try {
					await HusqApi.requestNewAccessToken();
					await this.setStateAsync('keys.accessToken', {val: HusqApi.accessToken, ack: true});
					this.log.info('new accessToken: ' + HusqApi.accessToken);
					await this.sleep(1000);
					this.log.info('Sending command to API again ... ');
					let answer = await HusqApi.sendCommand(mowerId, type);
					this.log.info(answer);
				}
				catch (e) {
					this.log.info(e.message);
					this.log.error('Error logging in ...');
				}
			}
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