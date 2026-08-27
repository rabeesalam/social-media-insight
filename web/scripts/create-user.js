#!/usr/bin/env node
// Dev/admin utility: create a Supabase Auth user for this project and optionally promote them to
// the 'admin' role. Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the
// environment (e.g. `set -a && source ../.env.local && set +a` first, or web/.env.local).
//
// Usage: node scripts/create-user.js user@example.com [--admin]

const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.argv[2]
const makeAdmin = process.argv.includes('--admin')

if (!url || !serviceKey || !email) {
  console.error('Usage: node scripts/create-user.js user@example.com [--admin]')
  console.error('Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.')
  process.exit(1)
}

const password = crypto.randomBytes(9).toString('base64url')
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
;(async () => {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) {
    console.error('CREATE_USER_FAILED:', error.message)
    process.exit(1)
  }

  if (makeAdmin) {
    const { error: roleError } = await supabase
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', data.user.id)

    if (roleError) {
      console.error('ROLE_UPDATE_FAILED:', roleError.message)
      process.exit(1)
    }
  }

  console.log('USER_CREATED')
  console.log('email:', email)
  console.log('role:', makeAdmin ? 'admin' : 'viewer (default)')
  console.log('temp_password:', password)
  console.log('(Share this with the user out-of-band and have them change it after first login.)')
})()
