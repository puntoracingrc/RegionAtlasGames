from pathlib import Path
import json
root=Path(__file__).parent;src=root/'src'
shell=(src/'shell.html').read_text()
for tag,file in [('CSS','app.css'),('ENGINE','engine.js'),('SCENARIOS','scenarios.js'),('BROADCAST','broadcast.js'),('APP','app.js')]:
 shell=shell.replace('/*__'+tag+'__*/',(src/file).read_text())
seeds={'NITRO':json.loads((src/'seed-nitro.json').read_text()),'ECO':json.loads((src/'seed-eco.json').read_text())}
shell=shell.replace('/*__SEED__*/',json.dumps(seeds,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c'))
assert '/*__' not in shell
(root/'carreracerdanyola.html').write_text(shell)
print('HTML:',len(shell.encode()),'bytes')
