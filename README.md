# RentSathi — Next.js + MongoDB

PHP version ko chhede bina Next.js App Router, React, TypeScript aur MongoDB par nayi copy `rent-sathi-nextjs` folder me banayi gayi hai.
Backend ke liye Next.js Node.js Route Handlers use kiye gaye hain; alag Express server ki zaroorat nahi hai.

## Local setup

1. Node.js 20.9+ aur MongoDB Atlas (ya local MongoDB) taiyar karein.
2. Is folder me `.env.example` ko `.env.local` ke naam se copy karke `MONGODB_URI`, `AUTH_SECRET`, `ADMIN_USERNAME`, `ADMIN_NAME` aur `ADMIN_PASSWORD` set karein. Password strong rakhein; purana demo password reuse na karein.
3. Dependencies install aur pehla admin user create karein:

   ```bash
   npm install
   npm run seed:admin
   ```

4. `npm run dev` chalayein aur `http://localhost:3000` kholein.

`npm run seed:admin` existing username ka password update karta hai, isliye use dobara chalane par admin password reset hoga.

## Vercel deployment

1. `rent-sathi-nextjs` ko Git repository me push karke Vercel me import karein. Agar poora PHP + Next.js repository import kar rahe hain, Project Settings me Root Directory `rent-sathi-nextjs` set karein.
2. MongoDB Atlas me production cluster/database banayein. Atlas Network Access me Vercel ke liye supported connectivity configure karein aur database user ko least-privilege access dein.
3. Vercel Project Settings → Environment Variables me `MONGODB_URI`, `AUTH_SECRET`, `ADMIN_USERNAME`, `ADMIN_NAME`, `ADMIN_PASSWORD` set karein. `AUTH_SECRET` ko kam-se-kam 32 random characters rakhein. Secret values source control me commit na karein.
4. Deploy karein. Pehla admin user banane ke liye Vercel CLI se production environment values `.env.local` me pull karein (`vercel env pull .env.local --environment=production`), phir `npm run seed:admin` chalayein. Seed script koi default credential create nahi karta.
5. Login verify karne ke baad `ADMIN_PASSWORD` ko Vercel environment se hata sakte hain; yeh sirf seed script ke liye zaroori hai. `MONGODB_URI` aur `AUTH_SECRET` deployment ke liye rehne chahiye.

Tenant documents MongoDB me private binary data ke roop me save hote hain; app ke authenticated file route ke bina unhe access nahi kiya ja sakta. Production me file size 4 MB tak rakhein.

## Scope / existing data

Nayi app me dashboard, flats, tenants, documents, payments, expenses, electricity bills/rates aur settings ke records MongoDB me manage hote hain. PHP app, MySQL tables aur source uploads apni jagah rehte hain; private files ko Git ya public static folder me copy nahi kiya jata.

## Legacy PHP/MySQL import

Migration local machine par chalti hai, jahan purana XAMPP MySQL aur `uploads` folder available hon. Yeh purane MySQL records ko **read-only** padhti hai; source tables, files aur admin password hash ko edit/delete nahi karti. Naya admin account `npm run seed:admin` se alag manage hota hai.

1. Pehle MySQL/phpMyAdmin start karke database ka backup lein.
2. Agar purane MySQL connection defaults se alag hain, `.env.local` me `LEGACY_MYSQL_HOST`, `LEGACY_MYSQL_PORT`, `LEGACY_MYSQL_DATABASE`, `LEGACY_MYSQL_USER`, `LEGACY_MYSQL_PASSWORD` aur zaroorat par `LEGACY_UPLOADS_DIR` set karein. Password shell command ya chat me na daalein.
3. Pehle safe dry-run chalayein:

   ```bash
   npm run migrate:legacy
   ```

4. Reported counts aur validation check karne ke baad actual import chalayein:

   ```bash
   npm run migrate:legacy -- --apply
   ```

5. Same import dobara chalana idempotent hai: pehle import hue records update/duplicate nahi hote. Source MySQL ki copies ko original numeric IDs se linked internal markers se map kiya jata hai. Unrelated existing MongoDB records ke saath ambiguous merge mile to migration ruk jati hai.

Tenant/payment/electricity relationships aur duplicate rent-month records preflight me check hote hain. PDF/JPG/PNG uploads signature-check ke baad private MongoDB storage me jaate hain; missing, invalid ya MongoDB document limit se bade files report hote hain aur unka metadata import hota hai. Kisi validation error par records likhne se pehle migration rukti hai.

Initial migration complete: 2 flats, 2 tenants, 1 document (file samet), 34 payments, 2 electricity rates, 33 electricity readings, 1 settings record; koi expenses nahi the. Password hashes/users import nahi hue.
