'use strict';

const fs = require('fs');
const path = require('path');
const RSVP = require('rsvp');
const minimatch = require('minimatch');

const denodeify = require('rsvp').denodeify;
const readFile  = denodeify(fs.readFile);

const DeployPluginBase = require('ember-cli-deploy-plugin');

const CloudflareClient = require('./lib/cloudflare');

module.exports = {
  name: require('./package').name,

  createDeployPlugin: function (options) {
    const DeployPlugin = DeployPluginBase.extend({
      name: options.name,

      defaultConfig: {
        filePattern: 'index.html',
        activationSuffix: 'current',
        activationContentSuffix: 'current-content',

        distDir: function(context) {
          return context.distDir;
        },

        distFiles: function(context) {
          return context.distFiles || [];
        },

        didDeployMessage: function(context){
          const revisionKey = context.revisionData && context.revisionData.revisionKey;
          const activatedRevisionKey = context.revisionData && context.revisionData.activatedRevisionKey;
          if (revisionKey && !activatedRevisionKey) {
            return `Deployed but did not activate revision ${revisionKey}. 
                    To activate, run: ember deploy:activate ${context.deployTarget} --revision=${revisionKey}`;
          }
        },

        revisionKey: function(context) {
          return context.commandOptions.revision || (context.revisionData && context.revisionData.revisionKey);
        },

        revisionData: function(context) {
          return context.revisionData;
        },

        keyPrefix: function(context) {
          return context.project.name();
        },

        cfClient: function(_context, pluginHelper) {
          const email = pluginHelper.readConfig('email');
          const apiKey = pluginHelper.readConfig('apiKey');
          const accountId = pluginHelper.readConfig('accountId');
          const namespace = pluginHelper.readConfig('namespace');

          return new CloudflareClient(email, apiKey, accountId, namespace);
        }
      },

      requiredConfig: ['accountId', 'email', 'apiKey', 'namespace'],

      upload: async function(/* context */) {      
        const cfClient          = this.readConfig('cfClient');
        const distDir           = this.readConfig('distDir');
        const distFiles         = this.readConfig('distFiles');
        const filePattern       = this.readConfig('filePattern');
        const keyPrefix         = this.readConfig('keyPrefix');
        const revisionKey       = this.readConfig('revisionKey');

        const filesToUpload = distFiles.filter(minimatch.filter(filePattern, { matchBase: true }));

        if (!filesToUpload.includes('index.html')) {
          return this._errorMessage(new Error("`filePattern` must include index.html as your app's entry point"));
        }

        const uploadPromises = filesToUpload.map(async fp => {
          this.log(`Uploading \`${fp}\``, { verbose: true });
          try {
            const fileContents = await this._readFileContents(path.join(distDir, fp));
            return await cfClient.fetch(`${keyPrefix}-${path.parse(fp).name}-${revisionKey}`, 'PUT', fileContents);
          } catch(e) {
            return this._errorMessage(e);
          }
        });

        try {
          await RSVP.all(uploadPromises);
          filesToUpload.forEach(fp => this.log(`Uploaded with key \`${keyPrefix}-${path.parse(fp).name}-${revisionKey}\``, { verbose: true }));

          await this._updateRevisionList(`${keyPrefix}-index-${revisionKey}`);
        } catch (e) {
          return this._errorMessage(e);
        }

        return RSVP.resolve();
      },

      willActivate: function(/* context */) {
        return RSVP.resolve();
      },

      activate: async function(/* context */) {
        const cfClient                = this.readConfig('cfClient');
        const keyPrefix                = this.readConfig('keyPrefix');
        const revisionKey              = this.readConfig('revisionKey');
        const activationSuffix         = this.readConfig('activationSuffix');
        const activationContentSuffix  = this.readConfig('activationContentSuffix');
        const keyName                  = `${keyPrefix}-index-${revisionKey}`;
        const activationKey            = `${keyPrefix}-index-${activationSuffix}`;
        const activationContentKey     = `${keyPrefix}-index-${activationContentSuffix}`;

        this.log(`Activating revision \`${revisionKey}\``, { verbose: true });

        const contentResponse = await cfClient.fetch(keyName, 'GET');

        const body = await contentResponse.text();
        await cfClient.fetch(activationContentKey, 'PUT', body);

        await cfClient.fetch(activationKey, 'PUT', revisionKey);

        this.log(`✔ Activated revision \`${revisionKey}\``);

        return RSVP.resolve({
          revisionData: {
            activatedRevisionKey: revisionKey
          }
        });
      },

      didDeploy: function(/* context */){
        const didDeployMessage = this.readConfig('didDeployMessage');
        if (didDeployMessage) {
          this.log(didDeployMessage);
        }
      },

      fetchInitialRevisions: async function() {
        const cfClient          = this.readConfig('cfClient');
        const keyPrefix         = this.readConfig('keyPrefix');

        this.log(`Listing initial revisions for key: \`${keyPrefix}-index\``);

        const resp = await cfClient.getRevisions(`${keyPrefix}-index`);
        const revisionJson = await resp.json();
        const revisions = revisionJson ? revisionJson.revisions : [];

        this.log(revisions.toString(), { verbose: true });
      
        return revisions;
      },

      fetchRevisions: async function(/* context */) {
        const cfClient          = this.readConfig('cfClient');
        const keyPrefix         = this.readConfig('keyPrefix');

        this.log(`Listing revisions for key: \`${keyPrefix}-index\``);

        const resp = await cfClient.getRevisions(`${keyPrefix}-index`);
        const revisionJson = await resp.json();
        const revisions = revisionJson ? revisionJson.revisions : [];

        this.log(revisions.toString(), { verbose: true });
      
        return revisions;
      },

      _updateRevisionList: async function(revisionKey) {
        this.log(`Updating revision list with \`${revisionKey}\``, { verbose: true });
        const revisionBody = {};

        const cfClient                 = this.readConfig('cfClient');
        const keyPrefix                = this.readConfig('keyPrefix');

        const getRevisions = await cfClient.getRevisions(`${keyPrefix}-index`)

        if (getRevisions.ok) {
          const currentRevisions = await getRevisions.json();
          revisionBody.revisions = [...currentRevisions.revisions, revisionKey];
        } else {
          revisionBody.revisions = [revisionKey];
        }

        await cfClient.fetch(`${keyPrefix}-index-revisions`, 'PUT', JSON.stringify(revisionBody));
      },

      _readFileContents: function(path) {
        return readFile(path)
          .then(function(buffer) {
            return buffer.toString();
          });
      },

      _errorMessage: function(error) {
        this.log(error, { color: 'red' });
        return RSVP.reject(error);
      },
    });

    return new DeployPlugin();
  }
};