import {
  PermissionsPolicyManager
} from '../src/permissions-policy-manager.js';

describe('PermissionsPolicyManager.overrideResponseHeaders', () => {
  const test_feature = 'FeatureA';
  const manager = new PermissionsPolicyManager();
  manager.customizedPolicies[test_feature] = {
    allowed: false,
    allowList: ["'none'"]
  };

  it('Should not add header if no override is specified', () => {
    expect(new PermissionsPolicyManager().overrideResponseHeaders([
      {
        name: 'other-header',
        value: 'foobar',
      }
    ]).responseHeaders).toEqual([
      {
        name: 'other-header',
        value: 'foobar',
      }
    ]);
  });

  it('Should override feature policy headers', () => {
    expect(manager.overrideResponseHeaders([
      {
        name: 'Feature-Policy',
        value: `${test_feature} *`
      }
    ]).responseHeaders).toEqual([
      {
        name: 'Feature-Policy',
        value: `${test_feature} 'none'`
      }, {
        name: 'Permissions-Policy',
        value: `${test_feature}=()`
      },
    ]);
  });

  it('Should override permissions policy headers', () => {
    expect(manager.overrideResponseHeaders([
      {
        name: 'Permissions-Policy',
        value: `${test_feature}=*`
      }
    ]).responseHeaders).toEqual([
      {
        name: 'Feature-Policy',
        value: `${test_feature} 'none'`
      }, {
        name: 'Permissions-Policy',
        value: `${test_feature}=()`
      },
    ]);
  });

  it('Should keep all other headers untouched', () => {
    expect(manager.overrideResponseHeaders([
      {
        name: 'other-header',
        value: 'foobar',
      }, {
        name: 'Feature-Policy',
        value: '',
      }, {
        name: 'Permissions-Policy',
        value: '',
      },
    ]).responseHeaders).toEqual(jasmine.arrayWithExactContents([
      {
        name: 'other-header',
        value: 'foobar',
      }, {
        name: 'Feature-Policy',
        value: `${test_feature} 'none'`
      }, {
        name: 'Permissions-Policy',
        value: `${test_feature}=()`
      },
    ]));
  });


});