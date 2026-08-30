import assert from "node:assert/strict";
import test from "node:test";
import {
  googleAvatarFromMetadata,
  isGoogleAvatarUrl,
  readHideGoogleAvatar,
  resolveAvatar,
  sizedGoogleAvatar,
} from "../lib/googleAvatar.ts";

// A real shape from this project's auth.users metadata.
const GOOGLE = "https://lh3.googleusercontent.com/a/ACg8ocKZOeW7EXmY1M1E4g9ia3P5LG5mkF0MBWOLAU955uUtyfOCjw=s96-c";

test("accepts Google's avatar CDN over https only", () => {
  assert.equal(isGoogleAvatarUrl(GOOGLE), true);
  assert.equal(isGoogleAvatarUrl("https://googleusercontent.com/a/x=s96-c"), true);
  assert.equal(isGoogleAvatarUrl("http://lh3.googleusercontent.com/a/x"), false, "http must be rejected");
});

test("rejects arbitrary hosts, since auth metadata is user-writable", () => {
  // A user can set their own user_metadata via auth.updateUser, so this must
  // not become a way to render an arbitrary remote image.
  for (const bad of [
    "https://evil.example.com/pixel.png",
    "https://googleusercontent.com.evil.example/x",
    "https://notgoogleusercontent.com/x",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "",
    null,
    undefined,
    42,
    {},
  ]) {
    assert.equal(isGoogleAvatarUrl(bad), false, `should reject ${JSON.stringify(bad)}`);
  }
});

test("reads the picture from either metadata key", () => {
  assert.equal(googleAvatarFromMetadata({ avatar_url: GOOGLE }), GOOGLE);
  assert.equal(googleAvatarFromMetadata({ picture: GOOGLE }), GOOGLE);
  // avatar_url wins when both are present.
  assert.equal(googleAvatarFromMetadata({ avatar_url: GOOGLE, picture: "https://x.googleusercontent.com/b" }), GOOGLE);
});

test("returns null when there is no usable picture", () => {
  assert.equal(googleAvatarFromMetadata(null), null);
  assert.equal(googleAvatarFromMetadata(undefined), null);
  assert.equal(googleAvatarFromMetadata({}), null);
  assert.equal(googleAvatarFromMetadata({ full_name: "Sajan" }), null);
  assert.equal(googleAvatarFromMetadata({ avatar_url: "https://evil.example.com/x.png" }), null);
});

test("upscales the size marker for retina, and clamps it", () => {
  assert.equal(sizedGoogleAvatar(GOOGLE), GOOGLE.replace("=s96-c", "=s192-c"));
  assert.equal(sizedGoogleAvatar(GOOGLE, 256), GOOGLE.replace("=s96-c", "=s256-c"));
  assert.equal(sizedGoogleAvatar("https://lh3.googleusercontent.com/a/x=s40", 128), "https://lh3.googleusercontent.com/a/x=s128");
  assert.ok(sizedGoogleAvatar(GOOGLE, 9999).includes("=s512-c"), "size must be clamped");
});

test("upscaling leaves anything without a size marker untouched", () => {
  const plain = "https://lh3.googleusercontent.com/a/ACg8ocABC";
  assert.equal(sizedGoogleAvatar(plain), plain);
  assert.equal(sizedGoogleAvatar("https://evil.example.com/x=s96-c"), "https://evil.example.com/x=s96-c");
  assert.equal(sizedGoogleAvatar(GOOGLE, 0), GOOGLE, "a nonsense size must not corrupt the URL");
  assert.equal(sizedGoogleAvatar(GOOGLE, NaN), GOOGLE);
});

test("an uploaded Calsie picture always beats the Google one", () => {
  const uploaded = "https://bnshgtrqbfuphhhdgccs.supabase.co/storage/v1/object/public/avatars/uid/avatar-1.webp";
  const result = resolveAvatar({ uploadedUrl: uploaded, googleUrl: GOOGLE });
  assert.deepEqual(result, { src: uploaded, source: "upload" });

  // Even when the user opted out of the Google picture.
  assert.equal(resolveAvatar({ uploadedUrl: uploaded, googleUrl: GOOGLE, hideGoogle: true }).source, "upload");
});

test("the Google picture is the default when nothing was uploaded", () => {
  const result = resolveAvatar({ googleUrl: GOOGLE });
  assert.equal(result.source, "google");
  assert.equal(result.src, GOOGLE.replace("=s96-c", "=s192-c"));
});

test("opting out of the Google picture falls back to initials", () => {
  assert.deepEqual(resolveAvatar({ googleUrl: GOOGLE, hideGoogle: true }), { src: "", source: "initial" });
});

test("no upload and no Google account falls back to initials", () => {
  assert.deepEqual(resolveAvatar({}), { src: "", source: "initial" });
  assert.deepEqual(resolveAvatar({ uploadedUrl: "", googleUrl: null }), { src: "", source: "initial" });
  assert.deepEqual(resolveAvatar({ uploadedUrl: "   " }), { src: "", source: "initial" });
});

test("removing an upload reveals the Google picture again", () => {
  const after = resolveAvatar({ uploadedUrl: null, googleUrl: GOOGLE });
  assert.equal(after.source, "google", "removing a Calsie photo should not drop to initials");
});

test("the hide-google preference is read strictly", () => {
  assert.equal(readHideGoogleAvatar({ hide_google_avatar: true }), true);
  assert.equal(readHideGoogleAvatar({ hide_google_avatar: false }), false);
  assert.equal(readHideGoogleAvatar({ hide_google_avatar: "true" }), false, "only a real boolean counts");
  assert.equal(readHideGoogleAvatar({}), false);
  assert.equal(readHideGoogleAvatar(null), false);
  assert.equal(readHideGoogleAvatar("nonsense"), false);
});
