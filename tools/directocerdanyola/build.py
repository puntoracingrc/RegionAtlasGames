from pathlib import Path
import json

root=Path(__file__).parent
src=root/'src'
shared=root.parent/'carreracerdanyola'/'src'
shell=(src/'shell.html').read_text()
parts={
    'CSS':src/'app.css',
    'ENGINE':shared/'engine.js',
    'SCENARIOS':shared/'scenarios.js',
    'BROADCAST':shared/'broadcast.js',
    'LIVE_CORE':src/'live-core.js',
    'REPLAY_CORE':src/'replay-core.js',
    'PIT_ANALYSIS':src/'pit-analysis.js',
    'RULES_DATA':src/'rules-data.js',
    'APP':src/'app.js',
}
for tag,path in parts.items():
    shell=shell.replace(f'/*__{tag}__*/',path.read_text())
seeds={'NITRO':json.loads((shared/'seed-nitro.json').read_text()),'ECO':json.loads((shared/'seed-eco.json').read_text())}
shell=shell.replace('/*__SEED__*/',json.dumps(seeds,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c'))
history=json.loads((root/'history'/'aecar-gt8-history.json').read_text())
shell=shell.replace('/*__HISTORY__*/',json.dumps(history,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c'))
registrations=json.loads((root/'registrations'/'aecar-cerdanyola-provisional.json').read_text())
shell=shell.replace('/*__REGISTRATIONS__*/',json.dumps(registrations,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c'))
track=json.loads((root/'track'/'cerdanyola.json').read_text())
shell=shell.replace('/*__TRACK__*/',json.dumps(track,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c'))
pit_profiles=json.loads((root/'pit-analysis'/'event-100645-profiles.json').read_text())
shell=shell.replace('/*__PIT_PROFILES__*/',json.dumps(pit_profiles,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c'))
demo_replay=json.loads((root/'demo'/'event-100645-nitro-final.json').read_text())
shell=shell.replace('/*__DEMO_REPLAY__*/',json.dumps(demo_replay,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c'))
assert '/*__' not in shell
(root/'directocerdanyola.html').write_text(shell)
print('HTML:',len(shell.encode()),'bytes')
