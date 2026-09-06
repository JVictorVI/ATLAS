// Ubuntu noble-updates. Review versions and SHA-256 together when updating.
export const linuxRuntimePackages = {
  "linux-x64": {
    baseUrl: "https://archive.ubuntu.com/ubuntu/",
    arch: "amd64",
    triplet: "x86_64-linux-gnu",
    loader: "ld-linux-x86-64.so.2",
    hashes: {
      libc6: "3b8d5391b6b484a4c81fd000b6064885ad967ec3cb966bc57603f3fb3ebf0ed5",
      "libgcc-s1": "aa7fadbe33b78bcf99885318040601c550c208929565b179891d9a3cc2aa68cd",
      libgomp1: "e8a95ec58125b4933597f30ff56c2ae10edf90f287262e366d4b6edea3019144",
      "libstdc++6": "a51f8de7829211db961a31f02158058ad1a95f92ac6d0a5dff6350e2821c54c0",
      "gcc-14-base": "b95c172411a7fdae70307cf33a9f5320ba5e056b556454543dd5b679d5ce1c4f",
      libssl3t64: "3d0955bc049bbcca0f4c3e78a3a8b994593d96db7d84f4320217224433844534",
    },
  },
  "linux-arm64": {
    baseUrl: "https://ports.ubuntu.com/ubuntu-ports/",
    arch: "arm64",
    triplet: "aarch64-linux-gnu",
    loader: "ld-linux-aarch64.so.1",
    hashes: {
      libc6: "2c6010da71b668e210aedaaac2b71fca3eef810e331710dd7c02b8c40ea16de8",
      "libgcc-s1": "5b191f79ad985a9a653dbba45214619f729f9178a9bdf92f7c68db06c50d070b",
      libgomp1: "cd49d2e8834d41a6618f097b678980defeebc47271bc7c5aa8ea2c2f1a53b7a6",
      "libstdc++6": "f84a05ac45a6884109b6527e911081a38263b89e042fc94a338cf975f61a330c",
      "gcc-14-base": "bddbe21061fdc73a23e7de79ece91693bf61aa22d634d1c69c5048385c114968",
      libssl3t64: "bf0b51fb18187c4e1b03900e1049dc219047080ff511aa3bf691dbe24e14d24a",
    },
  },
};

export const packages = [
  { name: "libc6", source: "glibc", version: "2.39-0ubuntu8.8", folder: "pool/main/g/glibc" },
  ...["libgcc-s1", "libgomp1", "libstdc++6", "gcc-14-base"].map(name => ({
    name, source: "gcc-14", version: "14.2.0-4ubuntu2~24.04.1", folder: "pool/main/g/gcc-14",
  })),
  { name: "libssl3t64", source: "openssl", version: "3.0.13-0ubuntu3.15", folder: "pool/main/o/openssl" },
];
