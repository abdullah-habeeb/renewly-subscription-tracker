# Subscription Tracker

The **Subscription Tracker** is a web application designed to help users manage their subscriptions, track costs, and view analytics. It leverages Firebase for backend services, including Authentication, Firestore, Hosting, and Functions, and provides a responsive and user-friendly interface for managing subscription data.

---

## Features

- **User Authentication**: Secure login and signup using Firebase Authentication.
- **Subscription Management**:
  - Add, edit, and delete subscriptions.
  - Track subscription costs, categories, and billing cycles.
- **Real-Time Updates**: Changes to subscription data are reflected instantly using Firestore's real-time capabilities.
- **Analytics Dashboard**:
  - View total monthly costs and active subscriptions.
  - Visualize subscription costs by category using charts.
- **Responsive Design**: Works seamlessly on desktop and mobile devices.
- **Local Development Support**: Firebase emulators for testing services locally.

---

## System Architecture

### **Frontend**
- **HTML, CSS, JavaScript**: Provides the user interface and handles client-side logic.
- **Chart.js**: Used for rendering subscription cost breakdown charts.
- **Firebase SDK**: Integrates Firebase services for authentication and Firestore.

### **Backend**
- **Firebase Authentication**: Manages user authentication.
- **Firebase Firestore**: Stores subscription data in a NoSQL database.
- **Firebase Hosting**: Hosts the static frontend files.
- **Firebase Functions**: (Optional) Can be used for server-side logic, such as sending reminders or performing scheduled tasks.

---

## Project Structure

```plaintext
subscription_tracker/
├── firebase.json          # Firebase configuration file
├── firestore.rules        # Firestore security rules
├── storage.rules          # Firebase Storage security rules
├── public/                # Static files for hosting
│   ├── index.html         # Main dashboard
│   ├── login.html         # Login and signup page
│   ├── style.css          # App styling
│   └── js/                # JavaScript files
│       ├── main.js        # Core app logic
│       ├── auth.js        # Authentication logic
│       └── firebase-config.js # Firebase initialization
├── functions/             # Firebase Functions (optional)
│   ├── index.js           # Cloud functions entry point
│   └── package.json       # Functions dependencies
└── README.md              # Project documentation



## Installation and Setup
1. Clone the Repository
Clone the project to your local machine:

2. Install Firebase CLI
Ensure you have the Firebase CLI installed:

3. Login to Firebase
Log in to your Firebase account:

4. Initialize Firebase
If you need to reinitialize Firebase for your project:

Select the following services:

Hosting: Configure Firebase Hosting for your static files.
Firestore: Enable Firestore for subscription data.
Authentication: Enable Firebase Authentication.
Functions: (Optional) Enable Firebase Functions.

5. Install Dependencies
Install dependencies for Firebase Functions:

## Local Development
1. Start Firebase Emulators
Run the Firebase emulators to test the app locally:

Hosting: http://localhost:5000
Emulator UI: http://localhost:4000
2. Access the App
Open your browser and navigate to http://localhost:5000 to view the app.

## Deployment
1. Deploy to Firebase
Deploy the app to Firebase Hosting:

2. Verify Deployment
Once deployed, Firebase will provide a hosting URL. Open the URL in your browser to access the app.

Firebase Configuration
firebase.json
The firebase.json file configures Firebase services:

## Hosting:
Serves static files from the public directory.
Rewrites all routes to index.html for SPA support.
Emulators:
Authentication: Port 9099
Firestore: Port 8081
Hosting: Port 5000
Functions: Port 5001
Emulator UI: Port 4000
Firestore Rules
The firestore.rules file ensures data security:

## Technologies Used
Frontend:
HTML, CSS, JavaScript
Chart.js
Backend:
Firebase Authentication
Firebase Firestore
Firebase Hosting
Firebase Functions (Optional)
Contributing
Contributions are welcome! To contribute:

Fork the repository.
Create a new branch:
Commit your changes:
Push to the branch:
Open a pull request.

##License
This project is licensed under the MIT License.

##Contact
For any questions or feedback, feel free to reach out:

Email: [itzabada19@gmail.com]
GitHub: [https://github.com/abdullah-habeeb]

##Acknowledgments
Firebase for providing a robust backend platform.
Chart.js for easy-to-use charting tools.
Open-source libraries and tools that made this project possible.
