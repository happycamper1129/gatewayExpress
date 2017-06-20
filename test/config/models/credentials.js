'use strict';

module.exports = {
  'basic-auth': {
    passwordKey: 'password',
    autoGeneratePassword: true,
    properties: {
      scopes: { isRequired: false }
    }
  },
  oauth: {
    passwordKey: 'secret',
    autoGeneratePassword: true,
    properties: {
      scopes: { isRequired: false }
    }
  }
};
