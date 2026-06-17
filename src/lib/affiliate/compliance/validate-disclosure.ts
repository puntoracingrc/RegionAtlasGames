import { AFFILIATE_DISCLOSURE_TEXT, disclosureIsValid } from "../disclosure";

export function validateAffiliateDisclosure(): boolean {
  return disclosureIsValid(AFFILIATE_DISCLOSURE_TEXT);
}
