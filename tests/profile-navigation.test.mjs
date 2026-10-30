import test from 'node:test';
import assert from 'node:assert/strict';
import {PROFILE_SECTIONS,profileSectionFromURL,profileNavigationURL} from '../shared/profileNavigation.mjs';
test('profile sections reload correctly and payment return takes priority',()=>{
 for(const s of PROFILE_SECTIONS){const url=profileNavigationURL(s,'https://patrac.stopik.cz/');assert.equal(profileSectionFromURL(url),s);assert.equal(new URL(url,'https://patrac.stopik.cz').searchParams.get('account'),'profile');}
 assert.equal(profileSectionFromURL('/?billing=success#profile/details'),'billing');assert.equal(profileSectionFromURL('/?billing=cancel'),'billing');
 const menu=profileNavigationURL('menu','https://patrac.stopik.cz/?billing=success');assert.equal(menu.includes('billing='),false);assert.equal(profileSectionFromURL(menu),'menu');
 assert.equal(profileSectionFromURL('/#profile/unknown'),'menu');assert.equal(profileSectionFromURL('/?account=recovery&token=fixture'),'menu');
 assert.equal(profileSectionFromURL(profileNavigationURL('notifications','https://patrac.stopik.cz/')),'notifications');
});
