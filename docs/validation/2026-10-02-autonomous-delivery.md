# Autonomous delivery verification, 2026-10-02

This record covers the local implementation. It does not claim a published release or physical Windows/Linux acceptance.

| Requirement | Delivered behavior | Verification |
|---|---|---|
| Reject unrelated Performance recordings | Independent capture-clock agreement, unambiguous request matching, explicit refusal reasons, no request annotations from rejected profiles | Profile unit/report tests; five genuine same-session pairs accepted and twenty cross-pair combinations refused |
| Preserve incomplete evidence | Missing clock ranges stay unknown; weak matches do not attach request details; HAR milestones remain when the profile is unplaced | Profile regression tests and browser file-input check with an hour-shifted profile |
| Faster supplemental collection | Offline embedded commands for Terminal and PowerShell, home-folder output, reviewable script and download alternatives | Bash launcher execution with an isolated interpreter; PowerShell invocation test; real-browser clipboard and denied-clipboard fallback checks |
| More informative route measurements | TCP port 443 when advertised by the installed Unix traceroute; explicit Windows TCP unavailability; repeated replies, timing ranges, failure notices and upper bounds | Synthetic traceroute command test; PowerShell parser executed with reply, timeout and less-than fixtures; helper model/report tests |
| Redact before helper output | Userinfo and secret query/fragment values removed while safe fields remain | Shell serialization canaries and PowerShell redaction self-test, including percent-encoded parameter names |
| Keep viewer standalone | Generated HTML includes all helper code and report assets, with no runtime dependencies or remote resource loads | Viewer build and real Chrome smoke test, including file imports, sequence exports, and zero remote requests or uncaught page errors |
| Current guidance | Supported optional file types and evidence limits described consistently | Coverage tests; vendor policy link check resolved all catalog links |
| Remaining field acceptance | Concrete evidence and pass criteria for physical machines, managed exports and colleague workflows | [Field-validation checklist](../FIELD-VALIDATION.md) |

Local `npm run verify` completed with 420 tests passed, no failures and no skips, including theme and embedded-helper freshness. An official portable PowerShell runtime was used to exercise the optional PowerShell tests on macOS; this verifies script logic, not Windows network APIs. No runtime was installed into the project and no security settings were changed.

`npm run audit:redaction -- captures` passed for eighteen supported local capture files. The audit does not recognize helper or policy files; their reader/redaction tests and helper serialization canaries cover those paths instead. Real captures and detailed local logs remain outside version control.

The genuine profile-pair check used existing local recordings for macOS Chrome and Edge, Windows Chrome and Edge, and Linux Chrome. Cross-pair checks combine recordings from different sessions; they supplement the synthetic alignment regressions without substituting for new field recordings.

These changes are available in the rebuilt `socketmap-viewer.html`. Publication, Windows PowerShell 5.1 execution on a physical Windows device, real Wi-Fi/proxy observations, and colleague acceptance are not claimed by this record.
