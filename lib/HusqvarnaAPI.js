"use strict";

const fetch = require('node-fetch');
const { URLSearchParams } = require('url');

class HusqvarnaAPI {
    constructor(username, password, appKey) {
        this.username = username;
        this.password = password;
        this.appKey = appKey;
        this.accessToken = '';
        this.refreshToken = '';
    }

    //WORKS
    async login() {
        if (this.username === '' || this.password === '' || this.appKey === '') throw new Error('Username, password and API key are required');
        const params = new URLSearchParams();
        params.set('grant_type', 'password');
        params.set('client_id', this.appKey);
        params.set('username', this.username);
        params.set('password', this.password);

        const res = await fetch('https://api.authentication.husqvarnagroup.dev/v1/oauth2/token', {
            method: 'POST',
            body: params
        });

        if (!res.ok) {
            throw new Error('Login with username, password and API key FAILED. html status:  ' + res.status + '     text: ' + res.statusText);
        } else {
            let token = await res.json();
            this.accessToken = token.access_token;
            this.refreshToken = token.refresh_token;
            return;
        }
    };


    //WORKS
    async requestNewAccessToken() {
        const params = new URLSearchParams();
        if (this.refreshToken === '') throw 'no refreshToken found. Exiting program ...';

        params.set('grant_type', 'refresh_token');
        params.set('client_id', this.appKey);
        params.set('refresh_token', this.refreshToken);

        const res = await fetch('https://api.authentication.husqvarnagroup.dev/v1/oauth2/token', {
            method: 'POST',
            body: params
        });

        if (!res.ok) {
            throw new Error("Error logging in with refresh key to get new accessKey. html status " + res.status + '     text: ' + res.statusText);
        }
        let token = await res.json();
        this.accessToken = token.access_token;
    }


    //WORKS
    async requestMowerStatus() {
        const mowerResponse = await fetch(`https://api.amc.husqvarna.dev/v1/mowers/`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'X-Api-Key': this.appKey,
                'Authorization-Provider': 'husqvarna'
            }
        });
        if (mowerResponse.ok) {
            return await mowerResponse.json();
        } else {
            throw new Error('requesting data from API with accessToken FAILED. htmlstatus: ' + mowerResponse.status + '   statustext: ' + mowerResponse.statusText);
        }
    }


    //WORKS
    async sendCommand(mowerId, type) {
        const requestOptions = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'X-Api-Key': this.appKey,
                'Authorization-Provider': 'husqvarna',
                'Content-Type': 'application/vnd.api+json'
            },
            body: JSON.stringify(type)
        };

        const commandResponse = await fetch(`https://api.amc.husqvarna.dev/v1/mowers/${mowerId}/actions`, requestOptions);

        if (commandResponse.ok) {
            return ('sent command to the mower. htmlstatus: ' + commandResponse.status + '    statustext: ' + commandResponse.statusText);
        } else {
            throw new Error('Error sending command. htmlstatus '+ commandResponse.status +'     statustext ' + commandResponse.statusText);
        }
    }
}


module.exports = HusqvarnaAPI;