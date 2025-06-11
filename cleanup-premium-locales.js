#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'src', 'locales');

// Keys to remove (premium/BTC payment related)
const keysToRemove = [
  // Premium features
  'start.freeTrial',
  'premium.already',
  'premium.freeTrialUsed',
  'premium.freeTrialActivated',
  'feature.requiresPremium',
  'cmd.premium',
  'cmd.upgrade',
  'cmd.freetrial',
  'cmd.setpremium',
  'cmd.unsetpremium',
  'cmd.ispremium',
  'cmd.listpremium',
  'help.monitoring',

  // Payment/BTC related
  'invoice.created',
  'invoice.pending',
  'invoice.paid',
  'invoice.expired',
  'invoice.error',
  'verify.usage',
  'verify.invalidArgs',
  'verify.wait',
  'verify.success',
  'verify.failure',
  'cmd.verify',

  // Admin premium commands
  'admin.setpremium',
  'admin.setpremiumUsage',
  'admin.setpremiumSuccess',
  'admin.setpremiumAlready',
  'admin.unsetpremium',
  'admin.unsetpremiumUsage',
  'admin.unsetpremiumSuccess',
  'admin.unsetpremiumNotPremium',
  'admin.ispremium',
  'admin.ispremiumUsage',
  'admin.ispremiumYes',
  'admin.ispremiumNo',
  'admin.listpremium',
  'admin.listpremiumNone',
  'admin.listpremiumHeader',
  'admin.freeTrialRedeemed',
  'admin.upgradePayment',

  // Referral system
  'referral.fiveUsers',
  'referral.successful',
  'start.inviteSuffix',

  // Monitor limits
  'monitor.premiumOnly',
  'monitor.limit',
  'monitor.limitMsg',
  'monitor.remaining',

  // Labels
  'label.premium',
  'label.free',
];

// Helper function to clean up help.admin text
function cleanupHelpAdmin(helpAdminText) {
  if (!helpAdminText || typeof helpAdminText !== 'string') {
    return helpAdminText;
  }

  // Remove setpremium line from help.admin
  return helpAdminText
    .replace(/\\n`\/setpremium[^\\n]*\\n/g, '\\n')
    .replace(/`\/setpremium[^`]*`[^\\n]*\\n/g, '')
    .replace(/\\n\\n/g, '\\n') // Clean up double newlines
    .trim();
}

function cleanupLocaleFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    let changed = false;

    // Remove premium/payment keys
    for (const key of keysToRemove) {
      if (key in data) {
        delete data[key];
        changed = true;
        console.log(`Removed ${key} from ${path.basename(filePath)}`);
      }
    }

    // Clean up help.admin to remove setpremium references
    if (data['help.admin']) {
      const original = data['help.admin'];
      const cleaned = cleanupHelpAdmin(original);
      if (cleaned !== original) {
        data['help.admin'] = cleaned;
        changed = true;
        console.log(`Cleaned help.admin in ${path.basename(filePath)}`);
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
      console.log(`Updated ${path.basename(filePath)}`);
    } else {
      console.log(`No changes needed for ${path.basename(filePath)}`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
}

// Process all locale files
const files = fs
  .readdirSync(localesDir)
  .filter((file) => file.endsWith('.json'));

console.log('Cleaning up premium references from locale files...\n');

for (const file of files) {
  const filePath = path.join(localesDir, file);
  cleanupLocaleFile(filePath);
}

console.log('\nLocale cleanup completed!');
