import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pgsql-parser', 'pgsql-deparser', 'libpg-query'],
}

export default nextConfig
