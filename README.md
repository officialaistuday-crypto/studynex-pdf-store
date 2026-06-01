# Studynex Pdf

Full working PDF selling website with frontend, backend, admin product upload, poster upload, PDF upload, price management, and buyer requests.

## Run

```bash
npm.cmd install
npm.cmd start
```

Open:

- Store: http://localhost:3000
- Admin: http://localhost:3000/admin

Default admin login:

```text
Email: shivamkumar85958707@gmail.com
Password: Shivam@123
```

You can change it before starting the server:

```bash
set ADMIN_PASSWORD=myStrongPassword
set ADMIN_EMAIL=my@email.com
npm.cmd start
```

## Features

- Public PDF store for exam subjects like History, Geography, Polity, Economics, Physics, Biology, Current Affairs, Static GK, Statistics, Maths, and Reasoning.
- Search and subject filters.
- Product cards with poster, subject, exam, price, pages, and tags.
- Buyer request form saved in backend.
- Hidden admin panel route to add/edit/delete PDFs.
- Admin can set price, upload poster image, and upload PDF.
- Uploaded PDFs are not public static files. They can be downloaded only from admin API.

## Payment

Payment gateway is not connected yet. The current Buy Request flow saves buyer leads in `data/orders.json`. Later you can connect Razorpay, Stripe, UPI, or another payment provider inside the `/api/orders` flow.

## Put Online

Use Node hosting with persistent storage because this app has backend uploads and JSON data.

Recommended beginner flow:

1. Upload this folder to a GitHub repository.
2. Create a Node web service on Render or Railway from that GitHub repo.
3. Set build command:

```bash
npm install
```

4. Set start command:

```bash
npm start
```

5. Add environment variables:

```text
ADMIN_EMAIL=shivamkumar85958707@gmail.com
ADMIN_PASSWORD=Shivam@123
ADMIN_TOKEN_SECRET=make-a-long-random-secret
STORAGE_DIR=/opt/render/project/src/storage
```

6. Add a persistent disk/volume and mount it to the same path as `STORAGE_DIR`.

Without persistent storage, uploaded posters, PDFs, and orders can disappear after redeploy.
