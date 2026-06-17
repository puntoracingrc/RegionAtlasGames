export type RakutenAccessTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  token_type?: "bearer" | string;
};

export type RakutenCachedToken = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: number;
};

export type RakutenProduct = {
  id?: string;
  productId?: string;
  advertiserId?: string;
  advertiserName?: string;
  merchantName?: string;
  productName?: string;
  title?: string;
  clickUrl?: string;
  linkUrl?: string;
  productUrl?: string;
  imageUrl?: string;
  price?: string | number;
  currency?: string;
  availability?: string;
  condition?: string;
};
