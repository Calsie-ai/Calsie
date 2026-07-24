export type AustralianPostcodeInfo = {
  postcode: string;
  valid: boolean;
  state: string;
  region: string;
  label: string;
};

export function normaliseAustralianPostcode(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 4);
}

function inRange(value: number, start: number, end: number) {
  return value >= start && value <= end;
}

function stateForPostcode(value: number) {
  if (inRange(value, 200, 299) || inRange(value, 2600, 2618) || inRange(value, 2900, 2920)) return "ACT";
  if (inRange(value, 800, 999)) return "NT";
  if (inRange(value, 1000, 2599) || inRange(value, 2619, 2899) || inRange(value, 2921, 2999)) return "NSW";
  if (inRange(value, 3000, 3999) || inRange(value, 8000, 8999)) return "VIC";
  if (inRange(value, 4000, 4999) || inRange(value, 9000, 9999)) return "QLD";
  if (inRange(value, 5000, 5999)) return "SA";
  if (inRange(value, 6000, 6999)) return "WA";
  if (inRange(value, 7000, 7999)) return "TAS";
  return "";
}

export function isGreaterSydneyPostcode(value: unknown) {
  const postcode = Number.parseInt(normaliseAustralianPostcode(value), 10);
  return Number.isFinite(postcode) && (
    inRange(postcode, 2000, 2234) ||
    inRange(postcode, 2555, 2574) ||
    inRange(postcode, 2740, 2786)
  );
}

export function inferAustralianPostcode(value: unknown): AustralianPostcodeInfo {
  const postcode = normaliseAustralianPostcode(value);
  if (postcode.length !== 4) return { postcode, valid: false, state: "", region: "", label: "" };

  const numeric = Number.parseInt(postcode, 10);
  const state = stateForPostcode(numeric);
  if (!state) return { postcode, valid: false, state: "", region: "", label: "" };

  let region = "";
  if (isGreaterSydneyPostcode(postcode)) region = "Greater Sydney";
  else if (state === "ACT" && (inRange(numeric, 2600, 2618) || inRange(numeric, 2900, 2920))) region = "Canberra";

  const label = region ? `${region} · ${state} ${postcode}` : `${state} ${postcode}`;
  return { postcode, valid: true, state, region, label };
}
