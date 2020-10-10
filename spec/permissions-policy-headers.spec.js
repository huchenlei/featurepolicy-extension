import { FeaturePolicyHeader, PermissionsPolicyHeader } from '../src/permissions-policy-header.js';

describe('FeaturePolicyHeader', () => {
  it('Should parse valid policy', () => {
    expect(FeaturePolicyHeader.parse(
      "A 'self';  B *; C 'none'; D foo.com bar.com 'self'"))
      .toEqual(new FeaturePolicyHeader(new Map(Object.entries({
        A: ["'self'"],
        B: ["*"],
        C: ["'none'"],
        D: ["foo.com", "bar.com", "'self'"]
      }))));
  });

  it('Should serialize correctly', () => {
    expect(new FeaturePolicyHeader(new Map(Object.entries({
      A: ["'self'"],
      B: ["*"],
      C: ["'none'"],
      D: ["foo.com", "bar.com", "'self'"]
    }))).serialize()).toEqual("A 'self'; B *; C 'none'; D foo.com bar.com 'self'");
  });
});

describe('PermissionsPolicyHeader', () => {
  it('Should parse valid policy', () => {
    expect(PermissionsPolicyHeader.parse(
      'A=self,  B=*, C=(), D=("foo.com" "bar.com" self)'))
      .toEqual(new PermissionsPolicyHeader(new Map(Object.entries({
        A: ["self"],
        B: ["*"],
        C: [""],
        D: ['"foo.com"', '"bar.com"', "self"]
      }))));
  });

  it('Should serialize correctly', () => {
    expect(new PermissionsPolicyHeader(new Map(Object.entries({
      A: ["self"],
      B: ["*"],
      C: [""],
      D: ['"foo.com"', '"bar.com"', "self"]
    }))).serialize()).toEqual('A=(self), B=(*), C=(), D=("foo.com" "bar.com" self)');
  });
});
