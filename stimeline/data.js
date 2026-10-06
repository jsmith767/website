// Everything the page shows lives in this file. timeline.js draws whatever is here.
//
// Dates may be a day (2024-09-30), a month (2024-09) or a year (2024).
// Test dates from 2017 on are the real lab dates, except the mid-2022 test, which is an
// estimate. Partner and vaccine dates before 2026 are estimates read off the original drawing.
// `estimated: true` marks a date that is a best guess rather than a known one.
// `undated: true` means "use the date for ordering only" (no year marker).
//
// Tests are stored as facts so they can be checked later: tests: { G: 'neg', HSV1: 'pos' }
//   keys: G, C, S, HIV, HepB, HepC, HSV1, HSV2      values: 'neg' or 'pos'
// The sentence on the timeline is written from them automatically. `text` replaces that sentence.
//
// Act rows are written as "who:part" tokens, left to right, e.g. "me:penis+condom blue:vagina".
//   parts: penis, vagina, mouth, hand     modifiers: +condom (penis), +hand (mouth)
// In text, {nosti} draws the "-STI" badge and {tested} draws the green "regularly tested" tube.
//
// In `about`, a line indented by two spaces is nested under the line above it.

const STIMELINE = {
  me: { color: '#4b0a82' },

  about: {
    boundaries:
      'My sexual partners communicate in a way to protect my sexual health.\n' +
      '  They disclose their relevant STI status.\n' +
      '  They disclose any activity that has the potential to change their STI status (e.g., sex with a new partner).',
    summary:
      'To the best of my knowledge (see timeline for more details):\n' +
      '  I am negative for Gonorrhea, Chlamydia, Syphilis, Hep C and HIV\n' +
      '  I am vaccinated against Hep B and HPV (Gardasil 9)\n' +
      '  I have some risk, but my analysis is the risk is low, of harboring a high risk strain of HPV.\n' +
      '  I have tested positive for the antibodies of HSV-1 (negative for HSV-2). I have never had a sore and have no reason to believe I have genital HSV-1/2. My mom had oral HSV-1',
    note: 'Hand to genital activity is not shown except in cases where there is a reasonable risk of the hand being a vector between other areas (e.g. genital-hand-genital, genital-hand-mouth, etc)\n' +
      'Most test dates are exact. Dates of partner interactions and vaccines before 2026 are approximate.'
  },

  // track: draw a dotted line between this partner's appearances. ongoing: line runs to the top.
  partners: {
    unnamed: { color: '#000000' },
    navy:    { color: '#0a0ab4', track: true },
    pink:    { color: '#f01cb0' },
    yellow:  { color: '#eef000' },
    orange:  { color: '#d95f02', track: true },
    dkgreen: { color: '#0a8a0a', track: true },
    lpurple: { color: '#a030e0', track: true },
    red:     { color: '#e60000', track: true, ongoing: true },
    lime:    { color: '#7ef000' },
    cyan:    { color: '#19c4f0' },
    mint:    { color: '#19e6b4' },
    teal:    { color: '#1a8fa3' },
    blue:    { color: '#0a5cf5' },
    gold:    { color: '#f0b01c' },
    violet:  { color: '#5a34e0' },
    brown:   { color: '#8b5a2b' },
    grey:    { color: '#8d99a6' }
  },

  extraYears: [2005],

  events: [
    { date: '2005-04-01', estimated: true, undated: true, icons: ['test'], tests: { HSV1: 'pos', HSV2: 'neg' },
      text: "Antibody test shows positive for HSV-1 and negative for HSV-2. Tested because of scare during high school. It is abundantly clear to me after talking to several physicians that the likelihood that I had genital HSV is wildly small. A parent has oral HSV-1. I've never had a sore anywhere." },
    { date: '2005-04-15', estimated: true, undated: true, who: ['unnamed'], boxes: [{ text: 'First Oral Sex' }] },

    { date: '2007-06-01', estimated: true, undated: true, icons: ['vaccine'], vaccine: 'Hep B' },
    { date: '2007-06-15', estimated: true, undated: true, who: ['unnamed'], boxes: [{ text: 'First PIV' }] },

    { date: '2017-04-26', icons: ['test'], tests: { G: 'neg', C: 'neg' } },

    { date: '2021-10-01', estimated: true, undated: true,
      info: 'Gardasil (original) only protects against types of HPV: 16, 18 and two wart types. Gardasil 9 protects against nine HPV types (6, 11, 16, 18, 31, 33, 45, 52, and 58).' },

    { date: '2022-02-01', icons: ['test', 'vaccine'],
      tests: { G: 'neg', C: 'neg', S: 'neg', HIV: 'neg', HepC: 'neg' }, vaccine: 'Gardasil 9 Round 1',
      text: 'T: Negative for G, C, HIV, S, and Hep C. Hep B consistent with vaccine\nV: Gardasil 9 Round 1' },
    { date: '2022-02-19', estimated: true, who: ['navy'], boxes: [{
      text: "Has HSV-1 that expresses around the anus. She is on daily viral suppressants and has not had sores since on the suppressants (December 2020). We used condoms for vaginal penetration and were unprotected for oral sex. We didn't do any anal play of any kind." }] },
    { date: '2022-03-18', estimated: true, icons: ['vaccine'], vaccine: 'Gardasil 9 Round 2' },
    { date: '2022-05-01', estimated: true, who: ['navy'] },
    { date: '2022-05-29', estimated: true, who: ['pink', 'yellow'], boxes: [
      { text: 'PIV sex with condom. No known STIs. Tested regularly' },
      { text: 'Oral. No known oral STIs. Tested Regularly' }] },
    { date: '2022-06-05', estimated: true, icons: ['vaccine'], vaccine: 'Gardasil 9 Round 3 (finished)' },
    { date: '2022-06-28', estimated: true, icons: ['test'], tests: { G: 'neg', C: 'neg', HIV: 'neg' } },
    { date: '2022-07-05', estimated: true, who: ['orange'], boxes: [{
      text: 'Pap revealed a high risk type of HPV. Had the Gardasil (original) vaccine in high school. We had unprotected sex (PIV, oral-genital). I am protected with Gardasil 9. Negative G, C, & HIV. She had other partners while we were sexually active. Has oral HSV-1 and uses suppressants reactively. We were pretty careful to avoid exposure during an outbreak.' }] },

    { date: '2023-02-23', estimated: true, who: ['dkgreen'], boxes: [{
      rows: ['me:hand dkgreen:vagina', 'me:penis dkgreen:hand'], text: '{nosti}' }] },
    { date: '2023-04-21', estimated: true, who: ['dkgreen'] },
    { date: '2023-08-09', icons: ['test'], tests: { G: 'neg', C: 'neg', S: 'neg', HIV: 'neg' } },
    { date: '2023-07-21', estimated: true, who: ['orange'], boxes: [{
      text: 'Stopped PIV and oral sex. Still occasionally hand to genital touching' }] },
    { date: '2023-09-14', estimated: true, who: ['orange'] },
    { date: '2023-10-14', estimated: true, who: ['lpurple'], boxes: [{
      text: "Barriered PIV sex. Oral sex and genital to genital touching without barriers. History of Chlamydia (2020) and low risk strain of HPV/genital warts (2021) both of which were treated and haven't shown up again." }] },
    { date: '2023-12-11', icons: ['test'], tests: { G: 'neg', C: 'neg', S: 'neg', HIV: 'neg' } },

    { date: '2024-01-03', estimated: true, who: ['lpurple'], boxes: [{ text: 'Introduced barriered PIV sex' }] },
    { date: '2024-01-31', estimated: true, who: ['red', 'lpurple', 'lime'], extra: 1, boxes: [
      { text: 'PIV sex with condom. No known STIs. Tested regularly' },
      { text: 'Same as previously written' },
      { text: 'PIV sex with condom. No known STIs. Tested regularly' }] },
    { date: '2024-03-04', icons: ['test'], tests: { G: 'neg', C: 'neg', S: 'neg', HIV: 'neg' } },
    { date: '2024-04-06', estimated: true, who: ['red'], boxes: [{
      text: 'Introduced unbarriered PIV. Has several other partners and uses barriers for PIV with all. Unbarriered oral with other partners.' }] },
    { date: '2024-06-05', estimated: true, who: ['red', 'cyan', 'mint', 'lime'], extra: 4, boxes: [
      { rows: ['me:penis red:vagina'] },
      { rows: ['me:penis+condom cyan:vagina', 'me:penis cyan:mouth', 'me:penis mint:mouth', 'me:penis cyan:mouth+hand mint:penis'] },
      { rows: ['me:hand teal:vagina'] },
      { text: 'Play Party. Extra room for indirect contact. Everyone {nosti}{tested}' }] },
    { date: '2024-07-22', estimated: true, who: ['violet'], boxes: [{
      rows: ['me:penis violet:mouth'], text: '{nosti}{tested}' }] },
    { date: '2024-09-06', estimated: true, who: ['red', 'blue', 'gold', 'teal', 'lime'], extra: 3, boxes: [
      { rows: ['me:penis red:vagina'] },
      { rows: ['me:penis+condom blue:vagina', 'me:penis blue:mouth', 'me:penis blue:mouth+hand gold:penis', 'me:penis gold:mouth'] },
      { rows: ['lime:vagina teal:penis+condom red:vagina me:penis'], text: 'Same Condom' },
      { text: 'Play Party. Extra room for indirect contact. Everyone {nosti}{tested}' }] },
    { date: '2024-09-30', icons: ['test'], tests: { G: 'neg', C: 'neg', S: 'neg', HIV: 'neg' },
      text: 'Negative for G, C, S, and HIV 9/30/2024' },

    { date: '2025-02-06', icons: ['test'], tests: { G: 'neg', C: 'neg', S: 'neg', HIV: 'neg' } },
    { date: '2025-09-18', icons: ['test'], tests: { G: 'neg', C: 'neg' } },
    { date: '2025-09-25', icons: ['test'], tests: { G: 'neg', C: 'neg', S: 'neg', HIV: 'neg', HepB: 'neg', HepC: 'neg' },
      text: 'Negative for G, C, S, HIV, and Hep C. Hep B consistent with vaccine' },
    { date: '2025-12-15', icons: ['test'], tests: { G: 'neg', C: 'neg', S: 'neg', HIV: 'neg', HepB: 'neg', HepC: 'neg' },
      text: 'Negative for G, C, S, HIV, and Hep C. Hep B consistent with vaccine' },

    { date: '2026-07', who: ['red', 'brown', 'grey'], boxes: [
      { rows: ['me:penis brown:mouth', 'me:penis grey:mouth'] },
      { text: 'One has HSV-2 genitally but was on antivirals. No symptoms have shown up.' }] }
  ]
};
