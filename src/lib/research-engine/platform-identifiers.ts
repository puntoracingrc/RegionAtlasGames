const SONY_PS3 = /^(BLES|BLUS|BLJM|BLAS|BLKS|BCES|BCUS|BCJS|BCAS|BCKS|NPUB|NPEB|NPJB)-/i;
const SONY_PS4 = /^CUSA-/i;
const SONY_PS5 = /^PPSA-/i;
const SONY_PSP = /^(ULES|ULUS|ULJM|ULKS|UCES|UCUS|UCJS|UCKS)-/i;
const SONY_VITA = /^(PCSB|PCSE|PCSG|PCSH|VLJM|VLAS|VLJS|VLKS)-/i;
const NINTENDO_DS = /^(NTR|TWL)-/i;
const NINTENDO_WIIU = /^(WUP|TSA-WUP)-/i;
const NINTENDO_SWITCH = /^(HAC|TSA-HAC|LA-H)-/i;
const NINTENDO_SWITCH2 = /^(POT|TSA-POT)-/i;

function normalizedCodes(codes: Array<string | null | undefined>): string[] {
  return codes
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
}

export function incompatiblePlatformIdentifiers(
  platformSlug: string,
  codes: Array<string | null | undefined>,
  options: { allowPreviousGenerationDisc?: boolean } = {},
): string[] {
  const values = normalizedCodes(codes);
  if (values.length === 0) return [];

  const invalid = (patterns: RegExp[]) => values.filter((value) => patterns.some((pattern) => pattern.test(value)));

  switch (platformSlug) {
    case "xbox360":
      return invalid([SONY_PS3, SONY_PS4, SONY_PS5, SONY_PSP, SONY_VITA, NINTENDO_DS, NINTENDO_WIIU, NINTENDO_SWITCH, NINTENDO_SWITCH2]);
    case "ps3":
      return invalid([SONY_PS4, SONY_PS5, SONY_PSP, SONY_VITA, NINTENDO_DS, NINTENDO_WIIU, NINTENDO_SWITCH, NINTENDO_SWITCH2]);
    case "ps4":
      return invalid([SONY_PS3, SONY_PS5, SONY_PSP, SONY_VITA, NINTENDO_DS, NINTENDO_WIIU, NINTENDO_SWITCH, NINTENDO_SWITCH2]);
    case "ps5":
      return invalid([
        ...(options.allowPreviousGenerationDisc ? [] : [SONY_PS4]),
        SONY_PS3,
        SONY_PSP,
        SONY_VITA,
        NINTENDO_DS,
        NINTENDO_WIIU,
        NINTENDO_SWITCH,
        NINTENDO_SWITCH2,
      ]);
    case "psp":
      return invalid([SONY_PS3, SONY_PS4, SONY_PS5, SONY_VITA, NINTENDO_DS, NINTENDO_WIIU, NINTENDO_SWITCH, NINTENDO_SWITCH2]);
    case "psvita":
      return invalid([SONY_PS3, SONY_PS4, SONY_PS5, SONY_PSP, NINTENDO_DS, NINTENDO_WIIU, NINTENDO_SWITCH, NINTENDO_SWITCH2]);
    case "ds":
    case "nintendo-ds":
      return invalid([SONY_PS3, SONY_PS4, SONY_PS5, SONY_PSP, SONY_VITA, NINTENDO_WIIU, NINTENDO_SWITCH, NINTENDO_SWITCH2]);
    case "wiiu":
    case "wii-u":
      return invalid([SONY_PS3, SONY_PS4, SONY_PS5, SONY_PSP, SONY_VITA, NINTENDO_DS, NINTENDO_SWITCH, NINTENDO_SWITCH2]);
    case "switch":
      return invalid([SONY_PS3, SONY_PS4, SONY_PS5, SONY_PSP, SONY_VITA, NINTENDO_DS, NINTENDO_WIIU, NINTENDO_SWITCH2]);
    case "switch2":
      return invalid([SONY_PS3, SONY_PS4, SONY_PS5, SONY_PSP, SONY_VITA, NINTENDO_DS, NINTENDO_WIIU, NINTENDO_SWITCH]);
    default:
      return [];
  }
}

export function looksLikePlatformIdentifier(value: string): boolean {
  const code = value.trim();
  return [
    SONY_PS3,
    SONY_PS4,
    SONY_PS5,
    SONY_PSP,
    SONY_VITA,
    NINTENDO_DS,
    NINTENDO_WIIU,
    NINTENDO_SWITCH,
    NINTENDO_SWITCH2,
  ].some((pattern) => pattern.test(code));
}
