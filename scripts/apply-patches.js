const fs = require("fs");
const path = require("path");

const patches = [
  {
    file: "node_modules/nexrad-level-3-data/src/packets/index.js",
    content: `const packetsRaw = [
	require('./1'),
	require('./2'),
	require('./6'),
	require('./8'),
	require('./10'),
	require('./13'),
	require('./14'),
	require('./15'),
	require('./16'),
	require('./17'),
	require('./18'),
	require('./19'),
	require('./32'),
	require('./a'),
	require('./c'),
	require('./f'),
	require('./af1f'),
];

// make up a list of packets by integer type
const packets = {};
packetsRaw.forEach((packet) => {
	if (packets[packet.code]) { throw new Error(\`Duplicate packet code \${packet.code}\`); }
	packets[packet.code] = packet;
});

// generic packet parser
const parser = (raf, productDescription) => {
	// get the packet code and then jump back in the file so it can be consumed by the packet parser
	const packetCode = raf.readUShort();
	raf.skip(-2);

	// turn into hex packet code
	const packetCodeHex = packetCode.toString(16).padStart(4, '0');

	// look up the packet code
	const packet = packets[packetCode];
	// first layer always results in an error
	if (!packet) throw new Error(\`Unsupported packet code 0x\${packetCodeHex}\`);
	return packet.parser(raf, productDescription);
};

module.exports = {
	packets,
	parser,
};
`,
  },
  {
    file: "node_modules/nexrad-level-3-data/src/products/index.js",
    content: `// NOTE: Browser-friendly build – avoid dynamic fs requires so bundlers can inline this module.
// Keep this list in sync with the directories in this folder.
const productsRaw = [
	require('./56'),
	require('./58'),
	require('./59'),
	require('./61'),
	require('./62'),
	require('./78'),
	require('./80'),
	require('./94'),
	require('./141'),
	require('./153'),
	require('./165'),
	require('./170'),
	require('./172'),
	require('./177'),
];

// make up a list of products by integer type
const products = {};
productsRaw.forEach((product) => {
	if (products[product.code]) { throw new Error(\`Duplicate product code \${product.code}\`); }
	products[product.code] = product;
});

// list of available product code abbreviations for type-checking
const productAbbreviations = productsRaw.map((product) => product.abbreviation).flat();

module.exports = {
	products,
	productAbbreviations,
};
`,
  },
  {
    file: "node_modules/nexrad-level-3-data/src/products/153/index.js",
    ensureDir: true,
    content: `const code = 153;
const abbreviation = ['N0B', 'N1B', 'N2B', 'N3B'];
const description = 'Super Resolution Base Reflectivity';
const { RandomAccessFile } = require('../../randomaccessfile');

// eslint-disable-next-line camelcase
const halfwords30_53 = (data) => {
	// turn data into a random access file for bytewise parsing purposes
	const raf = new RandomAccessFile(data);
	return {
		elevationAngle: raf.readShort() / 10,
		plot: {
			minimumDataValue: raf.readShort() / 10,
			dataIncrement: raf.readShort() / 10,
			dataLevels: raf.readShort(),
		},
		dependent34_46: raf.read(26),
		maxReflectivity: raf.readShort(),	// dBZ
		dependent48_49: raf.read(4),
		...deltaTime(raf.readShort()),
		compressionMethod: raf.readShort(),
		uncompressedProductSize: (raf.readUShort() << 16) + raf.readUShort(),
	};
};

// delta and time are compressed into one field
const deltaTime = (value) => ({
	deltaTime: (value & 0xFFE0) >> 5,
	nonSupplementalScan: (value & 0x001F) === 0,
	sailsScan: (value & 0x001F) === 1,
	mrleScan: (value & 0x001F) === 2,
});

module.exports = {
	code,
	abbreviation,
	description,

	productDescription: {
		halfwords30_53,
	},
};
`,
  },
];

patches.forEach((patch) => {
  const filePath = path.resolve(__dirname, "..", patch.file);
  if (patch.ensureDir) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      console.log(`Creating directory ${dir}...`);
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  console.log(`Patching ${filePath}...`);
  fs.writeFileSync(filePath, patch.content, "utf8");
});

console.log("Patches applied successfully.");
