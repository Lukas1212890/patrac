import test from 'node:test';
import assert from 'node:assert/strict';
import {ADMIN_SECTIONS,adminNavigationURL,readAdminNavigation} from '../shared/adminNavigation.mjs';
test('admin defaults to menu and preserves sections on reload and back navigation',()=>{
 assert.deepEqual(readAdminNavigation('https://patrac.stopik.cz/admin'),{section:'menu',notice:null});
 for(const section of ADMIN_SECTIONS){const url=adminNavigationURL(section,'https://patrac.stopik.cz/admin');assert.equal(readAdminNavigation(url).section,section);}
 assert.equal(readAdminNavigation('/admin#unknown').section,'menu');
});
test('push opens events and leaving that section clears the event link',()=>{
 const url='/admin?notice=payment%3Aorder_1';assert.deepEqual(readAdminNavigation(url),{section:'events',notice:'payment:order_1'});
 const profile=adminNavigationURL('players','https://patrac.stopik.cz'+url);assert.equal(profile,'/admin#players');assert.equal(readAdminNavigation(profile).section,'players');
 assert.equal(adminNavigationURL('menu','https://patrac.stopik.cz'+url),'/admin');
 assert.equal(readAdminNavigation('/admin?notice=https://example.com#players').section,'players');
});
