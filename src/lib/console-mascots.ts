export type ConsoleMascotId =
  | "atlas-buddy-nes"
  | "atlas-buddy-snes"
  | "atlas-buddy-n64"
  | "atlas-buddy-gameboy"
  | "atlas-buddy-gamecube"
  | "atlas-buddy-wii"
  | "atlas-buddy-ds"
  | "atlas-buddy-3ds"
  | "atlas-buddy-mastersystem"
  | "atlas-buddy-megadrive"
  | "atlas-buddy-sega32x"
  | "atlas-buddy-megacd"
  | "atlas-buddy-saturn"
  | "atlas-buddy-dreamcast"
  | "atlas-buddy-gamegear"
  | "atlas-buddy-neogeo"
  | "atlas-buddy-neogeocd"
  | "atlas-buddy-neogeopocket"
  | "atlas-buddy-ps1"
  | "atlas-buddy-ps2"
  | "atlas-buddy-ps3"
  | "atlas-buddy-ps4"
  | "atlas-buddy-ps5"
  | "atlas-buddy-switch"
  | "atlas-buddy-switch2"
  | "atlas-buddy-wiiu"
  | "atlas-buddy-xbox"
  | "atlas-buddy-xboxseriess"
  | "atlas-buddy-xboxseriesx";

export type ConsoleMascot = {
  id: ConsoleMascotId;
  platformSlug: string;
  label: string;
  src: string;
};

export type ConsoleMascotAction =
  | "add-game"
  | "remove-game"
  | "duplicate-game"
  | "price-update"
  | "no-results"
  | "complete-platform"
  | "import-games"
  | "import-failed"
  | "save-changes"
  | "general-error";

type ConsoleMascotPhrasePool = Partial<Record<ConsoleMascotAction, string[]>>;

export const CONSOLE_MASCOTS: ConsoleMascot[] = [
  { id: "atlas-buddy-nes", platformSlug: "nes", label: "NES Buddy", src: "/mascots/consoles/nes.png" },
  { id: "atlas-buddy-snes", platformSlug: "snes", label: "Super Nintendo Buddy", src: "/mascots/consoles/snes.png" },
  { id: "atlas-buddy-n64", platformSlug: "n64", label: "Nintendo 64 Buddy", src: "/mascots/consoles/n64.png" },
  { id: "atlas-buddy-gameboy", platformSlug: "gameboy", label: "Game Boy Buddy", src: "/mascots/consoles/gameboy.png" },
  { id: "atlas-buddy-gamecube", platformSlug: "gamecube", label: "GameCube Buddy", src: "/mascots/consoles/gamecube.png" },
  { id: "atlas-buddy-wii", platformSlug: "wii", label: "Wii Buddy", src: "/mascots/consoles/wii.png" },
  { id: "atlas-buddy-ds", platformSlug: "ds", label: "Nintendo DS Buddy", src: "/mascots/consoles/ds.png" },
  { id: "atlas-buddy-3ds", platformSlug: "3ds", label: "Nintendo 3DS Buddy", src: "/mascots/consoles/3ds.png" },
  { id: "atlas-buddy-mastersystem", platformSlug: "mastersystem", label: "Master System Buddy", src: "/mascots/consoles/mastersystem.png" },
  { id: "atlas-buddy-megadrive", platformSlug: "megadrive", label: "Mega Drive Buddy", src: "/mascots/consoles/megadrive.png" },
  { id: "atlas-buddy-sega32x", platformSlug: "sega32x", label: "Sega 32X Buddy", src: "/mascots/consoles/sega32x.png" },
  { id: "atlas-buddy-megacd", platformSlug: "megacd", label: "Mega CD Buddy", src: "/mascots/consoles/megacd.png" },
  { id: "atlas-buddy-saturn", platformSlug: "saturn", label: "Saturn Buddy", src: "/mascots/consoles/saturn.png" },
  { id: "atlas-buddy-dreamcast", platformSlug: "dreamcast", label: "Dreamcast Buddy", src: "/mascots/consoles/dreamcast.png" },
  { id: "atlas-buddy-gamegear", platformSlug: "gamegear", label: "Game Gear Buddy", src: "/mascots/consoles/gamegear.png" },
  { id: "atlas-buddy-neogeo", platformSlug: "neogeo", label: "Neo Geo AES Buddy", src: "/mascots/consoles/neogeo.png" },
  { id: "atlas-buddy-neogeocd", platformSlug: "neogeocd", label: "Neo Geo CD Buddy", src: "/mascots/consoles/neogeocd.png" },
  { id: "atlas-buddy-neogeopocket", platformSlug: "neogeopocket", label: "Neo Geo Pocket Buddy", src: "/mascots/consoles/neogeopocket.png" },
  { id: "atlas-buddy-ps1", platformSlug: "ps1", label: "PlayStation Buddy", src: "/mascots/consoles/ps1.png" },
  { id: "atlas-buddy-ps2", platformSlug: "ps2", label: "PlayStation 2 Buddy", src: "/mascots/consoles/ps2.png" },
  { id: "atlas-buddy-ps3", platformSlug: "ps3", label: "PlayStation 3 Buddy", src: "/mascots/consoles/ps3.png" },
  { id: "atlas-buddy-ps4", platformSlug: "ps4", label: "PlayStation 4 Buddy", src: "/mascots/consoles/ps4.png" },
  { id: "atlas-buddy-ps5", platformSlug: "ps5", label: "PlayStation 5 Buddy", src: "/mascots/consoles/ps5.png" },
  { id: "atlas-buddy-switch", platformSlug: "switch", label: "Nintendo Switch Buddy", src: "/mascots/consoles/switch.png" },
  { id: "atlas-buddy-switch2", platformSlug: "switch2", label: "Nintendo Switch 2 Buddy", src: "/mascots/consoles/switch2.png" },
  { id: "atlas-buddy-wiiu", platformSlug: "wiiu", label: "Wii U Buddy", src: "/mascots/consoles/wiiu.png" },
  { id: "atlas-buddy-xbox", platformSlug: "xbox", label: "Xbox Buddy", src: "/mascots/consoles/xbox.png" },
  { id: "atlas-buddy-xboxseriess", platformSlug: "xboxseriess", label: "Xbox Series S Buddy", src: "/mascots/consoles/xboxseriess.png" },
  { id: "atlas-buddy-xboxseriesx", platformSlug: "xboxseriesx", label: "Xbox Series X Buddy", src: "/mascots/consoles/xboxseriesx.png" },
];

export const CONSOLE_MASCOT_BY_PLATFORM = Object.fromEntries(
  CONSOLE_MASCOTS.map((mascot) => [mascot.platformSlug, mascot]),
) as Record<string, ConsoleMascot | undefined>;

export function getConsoleMascot(platformSlug: string): ConsoleMascot | undefined {
  return CONSOLE_MASCOT_BY_PLATFORM[platformSlug];
}

export const GENERIC_CONSOLE_MASCOT_PHRASES: ConsoleMascotPhrasePool = {
  "add-game": ["Añadido al inventario. Tu colección sube de nivel."],
  "remove-game": ["Eliminado. La estantería ha sentido un vacío."],
  "duplicate-game": ["Duplicado detectado. El coleccionismo nunca fue racional."],
  "price-update": ["Precio actualizado. El mercado ha hablado, aunque nadie le pidió opinión."],
  "no-results": ["No encuentro nada. Prueba con otro nombre, región o hechizo."],
  "complete-platform": ["Plataforma completada. La mascota exige una vitrina."],
  "import-games": ["Importación completada. Tu colección acaba de ponerse seria."],
  "import-failed": ["Algo ha fallado. El Excel ha usado ataque confusión."],
  "save-changes": ["Cambios guardados. La ficha respira tranquila."],
  "general-error": ["Algo ha salido raro. Probablemente no fue culpa del cartucho."],
};

export const CONSOLE_MASCOT_PHRASES: Record<string, ConsoleMascotPhrasePool> = {
  nes: {
    "add-game": ["Cartucho insertado. Soplar era opcional, pero emocionalmente necesario."],
    "remove-game": ["Has retirado un cartucho sagrado. La infancia acaba de pestañear."],
    "duplicate-game": ["Dos copias del mismo juego. Eso en 8 bits se llama estrategia."],
    "price-update": ["Este precio tiene más años que mis pines de conexión."],
    "no-results": ["No encuentro ese cartucho. Prueba a soplar la búsqueda."],
    "complete-platform": ["Plataforma completada. El salón de 1987 está orgulloso."],
  },
  snes: {
    "add-game": ["Nuevo cartucho añadido. Los 16 bits sonríen."],
    "remove-game": ["Ese juego se ha ido… pero su modo 7 vivirá en tu memoria."],
    "duplicate-game": ["Duplicado detectado. Alguien está montando una cooperativa de cartuchos."],
    "price-update": ["Este valor sube más suave que un scroll lateral bien hecho."],
    "no-results": ["No aparece. Quizá está escondido detrás del Donkey."],
    "complete-platform": ["Saga de cartuchos completada. Esto sí que es Super."],
  },
  n64: {
    "add-game": ["Juego añadido. Ya solo faltan tres amigos y cuatro mandos."],
    "remove-game": ["Juego eliminado. El stick analógico ha sufrido un poco más."],
    "duplicate-game": ["Tienes dos copias. Ideal para discutir cuál tiene la pegatina menos destrozada."],
    "price-update": ["Precio actualizado. La niebla poligonal no afecta al valor."],
    "no-results": ["No lo encuentro. Igual está perdido en un mundo abierto a 20 FPS."],
    "complete-platform": ["Plataforma completada. Cuatro puertos, una leyenda."],
  },
  gameboy: {
    "add-game": ["Juego añadido. Espero que tengas pilas."],
    "remove-game": ["Juego eliminado. La luz de la pantalla se apaga un poquito."],
    "duplicate-game": ["Duplicado detectado. Uno para jugar y otro para mirar con nostalgia."],
    "price-update": ["Precio actualizado. Sin retroiluminación, pero con valor."],
    "no-results": ["No aparece. Revisa entre las pilas AA."],
    "complete-platform": ["Colección completada. Portátil, gris y eterna."],
  },
  gamecube: {
    "add-game": ["Disco mini añadido. Pequeño, pero con carácter."],
    "remove-game": ["Juego borrado. El asa de la consola se ha puesto triste."],
    "duplicate-game": ["Tienes dos copias. Puedes llevar una en cada mano gracias al asa."],
    "price-update": ["Precio actualizado. El cubo está ganando músculo en el mercado."],
    "no-results": ["No lo encuentro. Quizá está dentro de un mini DVD paralelo."],
    "complete-platform": ["Plataforma completada. El cubo ha alcanzado su forma final."],
  },
  wii: {
    "add-game": ["Juego añadido. Ponte la correa antes de celebrar."],
    "remove-game": ["Juego eliminado. El mando acaba de apuntar al suelo."],
    "duplicate-game": ["Duplicado detectado. Esto huele a pack familiar."],
    "price-update": ["Precio actualizado. Movimiento detectado en el mercado."],
    "no-results": ["No aparece. Agita el Wiimote a ver si sale."],
    "complete-platform": ["Plataforma completada. La abuela también estaría orgullosa."],
  },
  ds: {
    "add-game": ["Juego añadido. Dos pantallas, doble alegría."],
    "remove-game": ["Juego eliminado. La pantalla táctil acaba de suspirar."],
    "duplicate-game": ["Duplicado detectado. Una copia para arriba y otra para abajo."],
    "price-update": ["Precio actualizado. El stylus confirma la operación."],
    "no-results": ["No lo encuentro. Mira debajo del lápiz táctil."],
    "complete-platform": ["Plataforma completada. Doble pantalla, colección cerrada."],
  },
  "3ds": {
    "add-game": ["Juego añadido. Lo veo venir… en 3D."],
    "remove-game": ["Juego eliminado. El efecto 3D se ha apagado de tristeza."],
    "duplicate-game": ["Duplicado detectado. Uno en 2D y otro en 3D, por si acaso."],
    "price-update": ["Precio actualizado. La profundidad del mercado ha cambiado."],
    "no-results": ["No aparece. Prueba a mover un poco la consola."],
    "complete-platform": ["Plataforma completada. Esta colección sí tiene profundidad."],
  },
  mastersystem: {
    "add-game": ["Juego añadido. Yo ya estaba aquí antes de que esto fuera mainstream."],
    "remove-game": ["Juego eliminado. La vieja guardia no olvida."],
    "duplicate-game": ["Duplicado detectado. Eso es tener respeto por los 8 bits."],
    "price-update": ["Precio actualizado. Clásico europeo en movimiento."],
    "no-results": ["No lo encuentro. Quizá está en una caja con cuadrícula ochentera."],
    "complete-platform": ["Plataforma completada. La Master aprueba."],
  },
  megadrive: {
    "add-game": ["Juego añadido. Los 16 bits han vuelto a rugir."],
    "remove-game": ["Juego eliminado. Blast processing emocional."],
    "duplicate-game": ["Duplicado detectado. Una copia para Mega Drive y otra para presumir."],
    "price-update": ["Precio actualizado. Este cartucho tiene actitud."],
    "no-results": ["No aparece. Igual corre demasiado rápido."],
    "complete-platform": ["Plataforma completada. Sega estaría gritando por dentro."],
  },
  sega32x: {
    "add-game": ["Juego añadido. Sí, existo. Y tengo catálogo."],
    "remove-game": ["Juego eliminado. Para una vez que alguien se acordaba de mí…"],
    "duplicate-game": ["Duplicado detectado. Tener dos 32X ya es una declaración de intenciones."],
    "price-update": ["Precio actualizado. Rareza activada."],
    "no-results": ["No aparece. Normal, hasta yo me pierdo a veces."],
    "complete-platform": ["Plataforma completada. Has domado al champiñón negro."],
  },
  megacd: {
    "add-game": ["Juego añadido. Cargando intro con música dramática."],
    "remove-game": ["Juego eliminado. El CD ha dejado de girar con dignidad."],
    "duplicate-game": ["Duplicado detectado. FMV por duplicado, qué peligro."],
    "price-update": ["Precio actualizado. El láser ha leído el mercado."],
    "no-results": ["No aparece. Puede estar en una cinemática interminable."],
    "complete-platform": ["Plataforma completada. El futuro en CD ha sido archivado."],
  },
  saturn: {
    "add-game": ["Juego añadido. Complejo, raro y maravilloso. Como yo."],
    "remove-game": ["Juego eliminado. Saturn ha entrado en órbita triste."],
    "duplicate-game": ["Duplicado detectado. En Saturn, hasta duplicar parece complicado."],
    "price-update": ["Precio actualizado. El mercado japonés me está mirando."],
    "no-results": ["No lo encuentro. Puede estar oculto en un menú raro."],
    "complete-platform": ["Plataforma completada. Has sobrevivido al laberinto de Saturn."],
  },
  dreamcast: {
    "add-game": ["Juego añadido. Yo sabía que el futuro llegaría."],
    "remove-game": ["Juego eliminado. Otra despedida temprana."],
    "duplicate-game": ["Duplicado detectado. Una copia para jugar y otra para llorar por lo que pudo ser."],
    "price-update": ["Precio actualizado. La VMU está calculando emociones."],
    "no-results": ["No aparece. Quizá se adelantó demasiado a su tiempo."],
    "complete-platform": ["Plataforma completada. Dreamcast vuelve a soñar."],
  },
  gamegear: {
    "add-game": ["Juego añadido. Dame seis pilas y te lo celebro."],
    "remove-game": ["Juego eliminado. La batería no ha sobrevivido."],
    "duplicate-game": ["Duplicado detectado. Necesitarás el doble de pilas."],
    "price-update": ["Precio actualizado. Portátil, grande y con hambre energética."],
    "no-results": ["No aparece. Quizá se apagó antes de cargar."],
    "complete-platform": ["Plataforma completada. La pantalla a color está orgullosa."],
  },
  neogeo: {
    "add-game": ["Juego añadido. Espero que tu cartera esté preparada."],
    "remove-game": ["Juego eliminado. Un aristócrata arcade acaba de caer."],
    "duplicate-game": ["Duplicado detectado. Dos AES… eso ya roza la nobleza."],
    "price-update": ["Precio actualizado. Nivel de lujo arcade confirmado."],
    "no-results": ["No aparece. Quizá está en una vitrina blindada."],
    "complete-platform": ["Plataforma completada. Has conquistado el trono arcade."],
  },
  neogeocd: {
    "add-game": ["Juego añadido. Cargando… pero con elegancia."],
    "remove-game": ["Juego eliminado. El lector ha soltado una lágrima lenta."],
    "duplicate-game": ["Duplicado detectado. Una copia para esperar y otra para seguir esperando."],
    "price-update": ["Precio actualizado. El CD también sabe ponerse fino."],
    "no-results": ["No aparece. Aún está cargando."],
    "complete-platform": ["Plataforma completada. Paciencia y arcade en estado puro."],
  },
  neogeopocket: {
    "add-game": ["Juego añadido. Pequeña consola, gran actitud."],
    "remove-game": ["Juego eliminado. El bolsillo arcade está triste."],
    "duplicate-game": ["Duplicado detectado. Dos bolsillos, doble estilo."],
    "price-update": ["Precio actualizado. Pequeño formato, gran rareza."],
    "no-results": ["No aparece. Mira en el bolsillo izquierdo."],
    "complete-platform": ["Plataforma completada. Mini arcade dominado."],
  },
  ps1: {
    "add-game": ["Juego añadido. Se oye el arranque en tu cabeza, ¿verdad?"],
    "remove-game": ["Juego eliminado. La tapa redonda se ha cerrado con pena."],
    "duplicate-game": ["Duplicado detectado. Una caja normal y otra con bisagra rota, seguro."],
    "price-update": ["Precio actualizado. El disco gris vuelve a girar."],
    "no-results": ["No aparece. Igual está en el segundo CD."],
    "complete-platform": ["Plataforma completada. El polígono ha vencido."],
  },
  ps2: {
    "add-game": ["Juego añadido. La consola que sobrevivió a todo."],
    "remove-game": ["Juego eliminado. Hasta mi lector ha hecho ruido de pena."],
    "duplicate-game": ["Duplicado detectado. En PS2 eso se llama “normalidad”."],
    "price-update": ["Precio actualizado. El catálogo infinito se mueve."],
    "no-results": ["No aparece. Entre tantos juegos, alguno tenía que esconderse."],
    "complete-platform": ["Plataforma completada. Acabas de cerrar una montaña."],
  },
  ps3: {
    "add-game": ["Juego añadido. Instalando datos emocionales."],
    "remove-game": ["Juego eliminado. El ventilador acaba de suspirar."],
    "duplicate-game": ["Duplicado detectado. Una copia física y otra por si actualiza tres horas."],
    "price-update": ["Precio actualizado. El Cell ha calculado el valor… más o menos."],
    "no-results": ["No aparece. Prueba después de una actualización del sistema."],
    "complete-platform": ["Plataforma completada. Trofeo platino de paciencia."],
  },
  ps4: {
    "add-game": ["Juego añadido. Biblioteca actualizada, mando cargado."],
    "remove-game": ["Juego eliminado. El menú acaba de hacer silencio."],
    "duplicate-game": ["Duplicado detectado. Una copia para jugar y otra para la estantería."],
    "price-update": ["Precio actualizado. El mercado sigue en modo rendimiento."],
    "no-results": ["No aparece. Quizá está instalando el parche de 80 GB."],
    "complete-platform": ["Plataforma completada. Captura guardada para presumir."],
  },
  ps5: {
    "add-game": ["Juego añadido. Rápido, limpio y con espacio… de momento."],
    "remove-game": ["Juego eliminado. El SSD respira, pero el corazón no."],
    "duplicate-game": ["Duplicado detectado. Eso sí que es jugar en modo lujo."],
    "price-update": ["Precio actualizado. Ray tracing activado sobre tu presupuesto."],
    "no-results": ["No aparece. Quizá aún está esperando stock."],
    "complete-platform": ["Plataforma completada. Nueva generación, vieja obsesión."],
  },
};

export const CONSOLE_MASCOT_PHRASE_ALIASES: Record<string, string> = {
  supernintendo: "snes",
  supernes: "snes",
  gb: "gameboy",
  gbc: "gameboy",
  gba: "gameboy",
  nds: "ds",
  nintendo3ds: "3ds",
  genesis: "megadrive",
  segacd: "megacd",
  neogeoaes: "neogeo",
  ngpc: "neogeopocket",
  playstation: "ps1",
  playstation1: "ps1",
  playstation2: "ps2",
  playstation3: "ps3",
  playstation4: "ps4",
  playstation5: "ps5",
};

function normalizeMascotPhraseSlug(platformSlug: string): string {
  const slug = platformSlug.trim().toLowerCase();
  return CONSOLE_MASCOT_PHRASE_ALIASES[slug] ?? slug;
}

function phraseIndex(seed: string, length: number): number {
  if (length <= 1) return 0;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % length;
}

export function getConsoleMascotPhrase(
  platformSlug: string,
  action: ConsoleMascotAction,
  seed = "",
): string {
  const normalizedSlug = normalizeMascotPhraseSlug(platformSlug);
  const phrases = CONSOLE_MASCOT_PHRASES[normalizedSlug]?.[action] ?? GENERIC_CONSOLE_MASCOT_PHRASES[action];
  if (!phrases?.length) return "La mascota ha tomado nota.";
  return phrases[phraseIndex(`${normalizedSlug}:${action}:${seed}`, phrases.length)];
}
