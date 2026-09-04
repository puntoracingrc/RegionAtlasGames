import type {
  FranchiseMembership,
  FranchiseRole,
  RelationshipEntityType,
  RelationshipType,
} from "./franchise-types";

export const FRANCHISE_ENTITY_LABELS: Record<RelationshipEntityType, string> = {
  game: "Juego",
  series: "Saga / Subserie",
  franchise: "Franquicia",
};

export const FRANCHISE_RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  sequel_to: "Secuela de",
  prequel_to: "Precuela de",
  spin_off_of: "Spin-off de",
  remake_of: "Remake de",
  remaster_of: "Remasterización de",
  reboot_of: "Reinicio de",
  crossover_with: "Crossover con",
  derived_from: "Derivada de",
  expansion_of: "Expansión de",
  standalone_expansion_of: "Expansión independiente de",
  successor_of: "Sucesora de",
  parent_of: "Entidad principal de",
  subseries_of: "Subserie de",
  compilation_of: "Recopilación de",
};

export const FRANCHISE_ROLE_OPTIONS: Array<{ value: FranchiseRole | ""; label: string }> = [
  { value: "", label: "Sin rol" },
  { value: "mainline", label: "Serie principal" },
  { value: "spin_off", label: "Spin-off" },
  { value: "side_story", label: "Historia paralela" },
  { value: "crossover", label: "Crossover" },
];

export const FRANCHISE_ROLE_LABELS: Record<FranchiseRole, string> = Object.fromEntries(
  FRANCHISE_ROLE_OPTIONS.filter((option): option is { value: FranchiseRole; label: string } =>
    Boolean(option.value),
  ).map((option) => [option.value, option.label]),
) as Record<FranchiseRole, string>;

export const FRANCHISE_MEMBERSHIP_LABELS: Record<FranchiseMembership, string> = {
  direct: "Directa",
  inherited: "Heredada",
  direct_and_inherited: "Directa y heredada",
};
