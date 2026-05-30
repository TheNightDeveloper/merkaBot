export type ClientPayload = {
  id?: string;
  email: string;
  limitIp: number;
  totalGB: number;
  expiryTime: number;
  enable: boolean;
  subId?: string;
  flow?: string;
  tgId?: string;
  comment?: string;
};

export type ClientTraffic = {
  up: number;
  down: number;
};

export type ProvisionedClient = {
  email: string;
  clientUuid: string;
  subId: string;
};
