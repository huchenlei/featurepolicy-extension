import {
  FeaturePolicyHeader,
  PermissionsPolicyHeader
} from '../src/permissions-policy-header.js';

/**
 * Converts allowlist item in Feature-Policy syntax to Permissions-Policy
 * syntax.
 * @param {string} item
 * @returns {string}
 */
function allowlistItemFP2PP(item) {
  switch (item) {
    case "*":
      return "*";
    case "'self'":
      return "self";
    case "'none'":
      return "";
    default:
      return `"${item}"`;
  }
}

function getPermissionsPolicyAllowListOnPage(features) {
  const map = {};
  const permissionsPolicy = document.policy ||
    document.permissionsPolicy ||
    document.featurePolicy;
  for (const feature of features) {
    map[feature] = {
      allowed: permissionsPolicy.allowsFeature(feature),
      allowList: permissionsPolicy.getAllowlistForFeature(feature),
    };
  }
  return map;
}

function sortObjectByKey(obj) {
  const sortedByName = {};
  Object.keys(obj).sort().forEach(key => {
    sortedByName[key] = obj[key];
  });
  return sortedByName;
}

let _allPermissionsPolicies = []; /* Array<string> all permissions policy names supported by the browser. */
let _originalPoliciesUsedOnPage = {};
let _customizedPolicies = {};

export class PermissionsPolicyManager {
  get allPermissionsPoliciesSupportedByBrowser() {
    if (!_allPermissionsPolicies.length) {
      console.warn(
        'List of permissions policies supported by the browser was not set.');
    }
    return _allPermissionsPolicies || [];
  }

  set allPermissionsPoliciesSupportedByBrowser(features) {
    _allPermissionsPolicies = features;
  }

  get originalPoliciesSetByPage() {
    return _originalPoliciesUsedOnPage || {};
  }

  set originalPoliciesSetByPage(policies) {
    _originalPoliciesUsedOnPage = policies;
  }

  get customizedPolicies() {
    return _customizedPolicies || {};
  }

  set customizedPolicies(policies) {
    _customizedPolicies = policies;
  }

  /**
   * Overrides the value in feature_policy parameter with |customizedPolicies|.
   *
   * @param {FeaturePolicyHeader} header
   * @returns {FeaturePolicyHeader}
   */
  overrideFeaturePolicyHeader(header) {
    for (const [policyName, val] of Object.entries(this.customizedPolicies)) {
      header.policies.set(policyName, val.allowList);
    }
    return header;
  }

  /**
   * Overrides the value in permissions_policy parameter with |customizedPolicies|.
   *
   * @param {PermissionsPolicyHeader} header
   * @returns {PermissionsPolicyHeader}
   */
  overridePermissionsPolicyHeader(header) {
    for (const [policyName, val] of Object.entries(this.customizedPolicies)) {
      header.policies.set(policyName, val.allowList.map(allowlistItemFP2PP));
    }
    return header;
  }

  /**
   * Override 'Permissions-Policy' and 'Feature-Policy' header's value
   * with those specified in |customizedPolicies|.
   *
   * @param {*} headers
   * @returns {*} the same type of input parameter |headers|.
   */
  overrideResponseHeaders(headers) {
    const FP_HEADER = 'Feature-Policy';
    const PP_HEADER = 'Permissions-Policy';

    function isFeaturePolicyHeader(header) {
      return !!header.name.match(RegExp(FP_HEADER, 'i'));
    }

    function isPermissionsPolicyHeader(header) {
      return header.name.match(RegExp(PP_HEADER, 'i'));
    }

    const featurePolicyHeaderString = headers
      .filter(isFeaturePolicyHeader)
      .map(header => header.value)
      .join(';');

    const permissionsPolicyHeaderString = headers
      .filter(isPermissionsPolicyHeader)
      .map(header => header.value)
      .join(',');

    const newFeaturePolicyHeaderString =
      this.overrideFeaturePolicyHeader(
        FeaturePolicyHeader.parse(featurePolicyHeaderString)
      ).serialize();

    const newPermissionsPolicyHeaderString =
      this.overridePermissionsPolicyHeader(
        PermissionsPolicyHeader.parse(permissionsPolicyHeaderString)
      ).serialize();

    return {
      responseHeaders: [
        ...(newFeaturePolicyHeaderString ? [{
          name: FP_HEADER,
          value: newFeaturePolicyHeaderString
        }] : []),
        ...(newPermissionsPolicyHeaderString ? [{
          name: PP_HEADER,
          value: newPermissionsPolicyHeaderString
        }] : []),
        ...headers
        .filter(header => !isFeaturePolicyHeader(header) && !isPermissionsPolicyHeader(header))
      ]
    };
  }

  restoreOriginalPoliciesSetByPage() {
    this.customizedPolicies = {};
    this.originalPoliciesSetByPage = {};
    UI.updateDOMLists();
  }

  buildCustomizedPolicyList() {
    const list = JSON.parse(JSON.stringify(this.originalPoliciesSetByPage));
    Object.entries(list).forEach(([feature, val]) => {
      if (this.customizedPolicies[feature]) {
        list[feature] = this.customizedPolicies[feature];
      }
    });
    return list;
  }

  getPermissionsPolicies() {
    // Inject the _getPermissionsPolicyAllowListOnPage function into the page
    // and return its eval'd result.
    const expression = `(function() {
      ${getPermissionsPolicyAllowListOnPage.toString()};
      const allPolicies = ${JSON.stringify(this.allPermissionsPoliciesSupportedByBrowser)};
      return getPermissionsPolicyAllowListOnPage(allPolicies);
    })()`;

    chrome.devtools.inspectedWindow.eval(expression, (result, isException) => {
      UI.clearError();

      if (isException) {
        UI.displayError("Error getting page's permissions policy list");
        return;
      }

      result = sortObjectByKey(result);

      if (!Object.keys(this.originalPoliciesSetByPage).length) {
        this.originalPoliciesSetByPage = result;
      }

      UI.updateDOMLists();
    });
  }

  togglePolicyOnPage(policyName) {
    const customizedFeature = this.customizedPolicies[policyName];
    if (customizedFeature) {
      const newAllowed = !customizedFeature.allowed;
      customizedFeature.allowed = newAllowed;
      customizedFeature.allowList = [newAllowed ? "*" : "'none'"];
    } else {
      const newAllowed = !this.originalPoliciesSetByPage[policyName].allowed;
      this.customizedPolicies[policyName] = {
        allowed: newAllowed,
        allowList: [newAllowed ? "*" : "'none'"],
      };
    }
  }
}
