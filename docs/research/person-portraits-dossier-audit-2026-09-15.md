# Auditoría del dossier de retratos de Personas — 2026-09-15

## Alcance y criterio

Se inspeccionaron `_LEEME.txt`, `_FUENTES_Y_ESTADO.csv`, `_GALERIA.html` y las 140 carpetas de `Personas_RegionAtlas_fotos.zip`. Las 140 carpetas contienen una ficha de RegionAtlas y las dos búsquedas declaradas; las 20 carpetas con candidato y las 46 con retrato previo coinciden exactamente con el CSV. Los enlaces de Google/Bing y las imágenes embebidas en la galería se trataron únicamente como pistas.

Solo se publica una imagen cuando hay identidad inequívoca, asset local, página estable del archivo original, licencia reutilizable explícita, autor y crédito. Las licencias se comprobaron de nuevo en la API de Wikimedia Commons el 15 de septiembre de 2026. No se copiaron ni enlazaron en producción imágenes editoriales, de subastas, foros, CDNs o resultados de buscador sin permiso positivo.

Resultado: 46 retratos se conservan sin cambios, 13 se enlazan desde assets ya retenidos y auditados, 18 candidatos del dossier se descartan como imágenes publicables y 63 personas continúan sin candidato verificable. Cobertura final de este conjunto: 59 de 140; quedan 81 personas pendientes.

## 13 retratos añadidos

| Persona | Asset local | Fuente estable | Licencia |
| --- | --- | --- | --- |
| Doug Bowser | `/person-portraits/doug-bowser.webp` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Nintendo_Switch_2_release_in_NYC_74.jpg) | CC BY 4.0 |
| Eiji Aonuma | `/person-portraits/eiji-aonuma.webp` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Eiji_Aonuma_at_E3_2013_(cropped_headshot).jpg) | CC BY-SA 3.0 de |
| Hirokazu Yasuhara | `/person-portraits/hirokazu-yasuhara.webp` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Hirokazu_yasuhara_gdc_2018.jpg) | CC BY 2.5 |
| Koji Kondo | `/person-portraits/koji-kondo.webp` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Koji_Kondo_E3_2006_(3x4_cropped).jpg) | CC BY-SA 2.0 |
| Masahiro Sakurai | `/person-portraits/masahiro-sakurai.webp` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Masahiro_Sakurai_2021.jpg) | CC BY 3.0 |
| Naoto Ohshima | `/person-portraits/naoto-oshima.webp` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Naoto_ohshima_gdc_2018.jpg) | CC BY 2.0 |
| Reggie Fils-Aimé | `/person-portraits/reggie-fils-aime.webp` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Reggie_Fils-Aime_-_Game_Developers_Conference_2011_-_Day_2_(1).jpg) | CC BY 2.0 |
| Takashi Tezuka | `/person-portraits/takashi-tezuka.webp` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Takashi_Tezuka_GDC_2024_2_(cropped).jpg) | CC BY 2.0 |
| Tetsuya Mizuguchi | `/person-portraits/tetsuya-mizuguchi.webp` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Tetsuya_Mizuguchi.jpg) | CC BY 2.0 |
| Tom Kalinske | `/person-portraits/tom-kalinske.webp` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Tom_Kalinske_by_Gage_Skidmore.jpg) | CC BY-SA 3.0 |
| Toshihiro Nagoshi | `/person-portraits/toshihiro-nagoshi.webp` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Toshihiro_Nagoshi_20140125.jpg) | CC BY 2.0 |
| Yuji Naka | `/person-portraits/yuji-naka.webp` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Yuji_Naka%27_-_Magic_-_Monaco_-_2015-03-21-_P1030036_(cropped).jpg) | CC BY-SA 3.0 |
| Yukio Futatsugi | `/person-portraits/yukio-futatsugi.webp` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Yukio_Futatsugi_-_Game_Developers_Conference_2019_-_03_(cropped).jpg) | CC BY 2.0 |

Naoto Ohshima usa el asset histórico `naoto-oshima.webp`: el registro retenido identifica `Naoto Ōshima` (Q658384) y enumera `Naoto Ohshima` como alias. Se documenta el cruce porque el slug público nuevo y el slug del asset no tienen la misma romanización.

## 46 retratos ya presentes y conservados

Alekséi Pázhitnov, Alex Evans, Amy Hennig, Andrew House, Bill Gates, Bruce Straley, David Cage, Don Mattrick, Ed Fries, Gabe Newell, Hermen Hulst, Hideo Kojima, Hidetaka Miyazaki, Hiroki Totoki, Hironobu Sakaguchi, Jack Tretton, Jade Raymond, Jenova Chen, John Carmack, John Romero, Kazunori Yamauchi, Kaz Hirai, Keiichiro Toyama, Ken Kutaragi, Mark Cerny, Mark Healey, Nate Fox, Neil Druckmann, Peter Moore, Phil Harrison, Phil Spencer, Ralph H. Baer, Richard Garriott, Roberta Williams, Satoru Iwata, Seamus Blackley, Shigeru Miyamoto, Shinji Mikami, Shuhei Yoshida, Sid Meier, Ted Price, Tim Sweeney, Tōru Iwatani, Will Wright, Yoko Taro y Yū Suzuki.

Sus rutas, autores, fuentes y licencias existentes no se alteran. El overlay nuevo se aplica al final y el validador falla si intenta sustituir cualquiera de estos retratos.

## 18 candidatos descartados como publicables

Estas personas siguen pendientes. “Descartado” se refiere a la imagen propuesta por el dossier, no a la persona ni a su ficha.

| Persona | Página fuente de la pista | Motivo |
| --- | --- | --- |
| Alex Kipman | [Engadget](https://www.engadget.com/hololens-chief-alex-kipman-leaving-microsoft-053826614.html) | El dossier no acredita una licencia reutilizable para la imagen editorial. |
| Angie Smets | [Shacknews](https://www.shacknews.com/article/135199/angie-smets-playstation-studios) | El dossier no acredita una licencia reutilizable para la imagen editorial. |
| Asha Sharma | [Jornal dos Jogos](https://newsletter.jornaldosjogos.com.br/p/asha-sharma-assume-como-ceo-do-xbox) | El dossier no acredita una licencia reutilizable para la imagen publicada en newsletter. |
| Bernie Stolar | [Sega Nerds](https://www.seganerds.com/2017/07/07/former-sega-ceo-bernie-stolar-teams-up-with-3d-realms-on-new-project/) | El dossier no acredita una licencia reutilizable para la imagen editorial. |
| Bonnie Ross | [Academy of Interactive Arts & Sciences](https://www.interactive.org/news/bonnie_ross_hall_of_fame_2019.asp) | Fuente institucional, pero sin permiso de reutilización aportado para la fotografía. |
| Bryan Intihar | [N4G](https://n4g.com/news/2571423/how-bryan-intihar-made-a-video-game-masterpiece-in-marvels-spider-man-2) | CDN/agregador sin autor ni licencia verificable en el dossier. |
| Chris Deering | [Vimeo](https://vimeo.com/39750188) | La miniatura de vídeo no aporta permiso de republicación como retrato. |
| Cory Barlog | [Mega Dads](https://www.megadads.org/home/2018/05/22/the-father-in-you-a-conversation-with-cory-barlog) | El dossier no acredita una licencia reutilizable para la fotografía. |
| Eikichi Kawasaki | [Neo Geo Forever](https://neogeoforever.com/thread/1066/photo-eikichi-kawasaki-lee-trevino) | Imagen alojada en un foro/host externo sin permiso positivo documentado. |
| Evan Wells | [Se7en](https://se7en.ws/evan-wells-former-naughty-dog-president-set-for-aias-hall-of-fame-induction/?lang=en) | La pista apunta a una copia editorial y no documenta autor/licencia de la foto. |
| Fusajiro Yamauchi | [Japan Society of Boston](https://www.japansocietyboston.org/post/fusajiro-yamauchi) | No hay permiso positivo documentado; además es una figura histórica que exige especial cautela de identidad. |
| Genyo Takeda | [Vooks](https://www.vooks.net/nintendos-technology-fellow-genyo-takeda-is-retiring/) | El dossier no acredita una licencia reutilizable para la imagen editorial. |
| Gunpei Yokoi | [El País](https://elpais.com/tecnologia/2014/04/17/actualidad/1397726072_143495.html) | Imagen de prensa sin licencia de republicación aportada. |
| Hajime Tabata | [Forbes](https://www.forbes.com/sites/olliebarder/2016/06/14/hajime-tabata-talks-briefly-about-his-hopes-for-final-fantasy-xv/) | Imagen de prensa sin licencia de republicación aportada. |
| Hayao Nakayama | [MobyGames](https://www.mobygames.com/person/62605/hayao-nakayama/shots/10954/) | La ficha no basta para acreditar derechos de reutilización del archivo. |
| Helen Chiang | [Magzter](https://www.magzter.com/stories/Entertainment/Edge/An-Audience-With-Helen-Chiang) | Imagen de revista sin licencia de republicación aportada. |
| Hideaki Nishino | [Console Creatures](https://www.consolecreatures.com/hideaki-nishino-ceo-sie/) | El dossier no acredita una licencia reutilizable para la imagen editorial. |
| Hidekazu Yukawa | [Yahoo! Auctions Japan](https://auctions.yahoo.co.jp/jp/auction/g1185640478) | Fotografía de una subasta: identidad/encuadre y derechos no son adecuados para publicación. |

Doug Bowser y Eiji Aonuma eran los otros dos candidatos del dossier. No se usaron esas imágenes editoriales: se enlazaron alternativas libres de Commons ya retenidas por RegionAtlas.

## 63 personas sin candidato publicable

Akira Sato, Alvin Daniel, Andrew Goossen, Danielle Bunten Berry, David Reeves, David Rosen, Dylan Cuthbert, Eric Williams, Fumihiko Yasuda, Geoff Glendenning, Hideki Konno, Hideki Sato, Hiroaki, Hiroshi Matsumoto, Hiroshi Yamauchi, Hisashi Nogami, Howard Lincoln, Isao Okawa, J Allard, James Armstrong, Jason Ronald, Jim Ryan, Johan Pilestedt, John Koller, Katsuya Eguchi, Keiji Inafune, Kensuke Tanabe, Kim Hyung-tae, Ko Shiota, Kouichi Kawamoto, Larry Hryb, Masaru Kato, Masayuki Uemura, Mathijs de Jonge, Matt Booty, Minoru Arakawa, Nicolas Doucet, Norio Ohga, Rieko Kodama, Robbie Bach, Ryan Smith, Ryuta Kawashima, Sarah Bond, Satoru Okada, Satoru Shibata, Satoshi Tajiri, Shahid Ahmad, Shane Kim, Shigesato Itoi, Shinkiro, Shinya Takahashi, Shuntaro Furukawa, Stig Asmussen, Takashi Nishiyama, Takuhiro Dohta, Tatsumi Kimishima, Teiyu Goto, Tetsuya Iida, Tetsuya Sasaki, Yasuyuki Oda, Yoshiaki Koizumi, Yoshio Sakamoto y Yujin Morisawa.

Para estas personas las búsquedas del dossier no son evidencia. No se ha incorporado ninguna miniatura ni hotlink.

### Bloqueo especial por homónimo

El perfil `shinkiro` conserva en el overlay de plataforma el QID `Q7496810`. La consulta actual de Wikidata devuelve “Shimabara Railway Line” y su P18 es una fotografía ferroviaria. No se utiliza ese dato y el perfil queda sin retrato hasta corregir/verificar la identidad canónica de la persona.

## Validación añadida

`npm run people:portraits:check` verifica el conjunto cerrado de retratos nuevos, que cada perfil exista y no tuviera retrato, la correspondencia con el registro de medios retenido, el asset WebP local, la ficha estable de Commons, licencia, autor, crédito y fuente pública. También comprueba que el componente use `next/image`, alt nominal, fallback accesible, `sizes` y que la ficha muestre autor, origen y licencia.
