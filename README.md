Installation
```bash
# Clone the repo
git clone https://github.com/your-username/climitra-dmrv.git

# Backend setup
cd Climetra\_Backend
npm install
npx prisma migrate dev --name init
npx prisma generate
npm run dev
