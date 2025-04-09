"use client";

import { useState, useEffect } from "react";
import { auth, db } from "../firebase-config";
import { updateEmail, updatePassword, updateProfile, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import ProtectedRoute from "@/app/components/protectedroute";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";

interface PaymentSettings {
    cashEnabled: boolean;
    gcashEnabled: boolean;
    gcashNumber?: string;
    gcashName?: string;
}

export default function Settings() {
    const [user, setUser] = useState({ name: "", email: "", password: "" });
    const [loginLogs, setLoginLogs] = useState<Array<{ date: string; time: string; ip: string }>>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>({
        cashEnabled: true,
        gcashEnabled: false,
        gcashNumber: '',
        gcashName: ''
    });
    const [isLoadingPaymentSettings, setIsLoadingPaymentSettings] = useState(true);

    const actionCodeSettings = {
        url: "http://localhost:3000/settings", // For localhost development
        handleCodeInApp: true,
    };
    

    useEffect(() => {
        const currentUser = auth.currentUser;
        if (currentUser) {
            setUser({ name: currentUser.displayName || "", email: currentUser.email || "", password: "" });
        }
        fetchLoginLogs();

        if (isSignInWithEmailLink(auth, window.location.href)) {
            const email = window.localStorage.getItem('newEmail');
            if (!email) return alert("Email not found. Please re-enter the email.");

            signInWithEmailLink(auth, email, window.location.href)
                .then(() => {
                    alert("Email successfully verified and updated!");
                })
                .catch((error) => {
                    console.error(error);
                    alert("Failed to verify email.");
                });
        }
    }, []);

    const fetchLoginLogs = async () => {
        const logsCollection = collection(db, "loginLogs");
        const snapshot = await getDocs(logsCollection);
        setLoginLogs(snapshot.docs.map(doc => doc.data() as { date: string; time: string; ip: string }));
    };

    const reauthenticateUser = async (password: string) => {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("No user is signed in.");

        const credential = EmailAuthProvider.credential(currentUser.email!, password);
        await reauthenticateWithCredential(currentUser, credential);
    };

    const handleUpdateProfile = async () => {
        try {
            if (auth.currentUser) {
                await updateProfile(auth.currentUser, { displayName: user.name });
                alert("Profile updated successfully!");
            }
        } catch (error: any) {
            alert(error.message);
        }
    };

    const handleChangePassword = async () => {
        try {
            const password = prompt("Enter your current password to confirm password change:");
            if (!password) return alert("Password confirmation is required.");

            await reauthenticateUser(password);
            await updatePassword(auth.currentUser!, user.password);

            alert("Password changed successfully!");
            setUser({ ...user, password: "" });
        } catch (error: any) {
            alert(error.message);
        }
    };

    const handleChangeEmail = async () => {
        try {
            const newEmail = user.email.trim();
            if (!newEmail) return alert("Email cannot be empty.");

            const password = prompt("Enter your password to confirm email change:");
            if (!password) return alert("Password confirmation is required.");

            await reauthenticateUser(password);
            await sendSignInLinkToEmail(auth, newEmail, actionCodeSettings);

            window.localStorage.setItem('newEmail', newEmail);
            alert(`A verification link has been sent to ${newEmail}. Please check your inbox.`);
        } catch (error: any) {
            alert(error.message);
        }
    };

    useEffect(() => {
        fetchPaymentSettings();
    }, []);

    const fetchPaymentSettings = async () => {
        try {
            const settingsDoc = await getDoc(doc(db, "settings", "payment"));
            if (settingsDoc.exists()) {
                setPaymentSettings(settingsDoc.data() as PaymentSettings);
            }
            setIsLoadingPaymentSettings(false);
        } catch (error) {
            console.error("Error fetching payment settings:", error);
            setIsLoadingPaymentSettings(false);
        }
    };

    const handlePaymentSettingsUpdate = async () => {
        try {
            if (!paymentSettings.cashEnabled && !paymentSettings.gcashEnabled) {
                alert("At least one payment method must be enabled.");
                return;
            }

            if (paymentSettings.gcashEnabled && (!paymentSettings.gcashNumber || !paymentSettings.gcashName)) {
                alert("Please provide both GCash number and account name.");
                return;
            }

            if (paymentSettings.gcashEnabled && !/^\d{11}$/.test(paymentSettings.gcashNumber)) {
                alert("Please enter a valid 11-digit GCash number.");
                return;
            }

            await setDoc(doc(db, "settings", "payment"), paymentSettings);
            alert("Payment settings updated successfully!");
        } catch (error) {
            console.error("Error updating payment settings:", error);
            alert("Failed to update payment settings. Please try again.");
        }
    };

    return (
        <ProtectedRoute>
            <div className="p-8 bg-gray-100 min-h-screen">
                <h1 className="text-4xl font-bold text-gray-800 mb-6 text-center">Settings</h1>

                <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                    <h2 className="text-2xl font-bold mb-4">My Profile</h2>
                    <p className="mb-2"><strong>Name:</strong> {user.name}</p>
                    <p className="mb-2"><strong>Email:</strong> {user.email}</p>
                    <button onClick={() => setIsEditing(!isEditing)} className="bg-blue-500 text-white px-4 py-2 rounded">
                        {isEditing ? "Cancel" : "Edit Profile"}
                    </button>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                    <h2 className="text-2xl font-bold mb-4">Payment Settings</h2>
                    {isLoadingPaymentSettings ? (
                        <p>Loading payment settings...</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="cashEnabled"
                                    checked={paymentSettings.cashEnabled}
                                    onChange={(e) => setPaymentSettings(prev => ({
                                        ...prev,
                                        cashEnabled: e.target.checked
                                    }))}
                                    className="h-4 w-4"
                                />
                                <label htmlFor="cashEnabled">Enable Cash Payments</label>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="gcashEnabled"
                                        checked={paymentSettings.gcashEnabled}
                                        onChange={(e) => setPaymentSettings(prev => ({
                                            ...prev,
                                            gcashEnabled: e.target.checked
                                        }))}
                                        className="h-4 w-4"
                                    />
                                    <label htmlFor="gcashEnabled">Enable GCash Payments</label>
                                </div>

                                {paymentSettings.gcashEnabled && (
                                    <div className="pl-6 space-y-2">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">GCash Number</label>
                                            <input
                                                type="text"
                                                value={paymentSettings.gcashNumber}
                                                onChange={(e) => setPaymentSettings(prev => ({
                                                    ...prev,
                                                    gcashNumber: e.target.value
                                                }))}
                                                placeholder="Enter GCash number"
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">GCash Account Name</label>
                                            <input
                                                type="text"
                                                value={paymentSettings.gcashName}
                                                onChange={(e) => setPaymentSettings(prev => ({
                                                    ...prev,
                                                    gcashName: e.target.value
                                                }))}
                                                placeholder="Enter GCash account name"
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handlePaymentSettingsUpdate}
                                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                            >
                                Save Payment Settings
                            </button>
                        </div>
                    )}
                </div>

                {isEditing && (
                    <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                        <h2 className="text-2xl font-bold mb-4">Edit Profile</h2>
                        <input
                            type="text"
                            className="w-full p-2 border rounded mb-2"
                            value={user.name}
                            onChange={(e) => setUser({ ...user, name: e.target.value })}
                        />
                        <button onClick={handleUpdateProfile} className="bg-blue-500 text-white px-4 py-2 rounded mb-4">Update Profile</button>

                        <h2 className="text-2xl font-bold mb-4">Change Password</h2>
                        <input
                            type="password"
                            className="w-full p-2 border rounded mb-2"
                            placeholder="New Password"
                            value={user.password}
                            onChange={(e) => setUser({ ...user, password: e.target.value })}
                        />
                        <button onClick={handleChangePassword} className="bg-green-500 text-white px-4 py-2 rounded">Change Password</button>

                        {/* <h2 className="text-2xl font-bold mb-4">Change Email</h2>
                        <input
                            type="email"
                            className="w-full p-2 border rounded mb-2"
                            placeholder="New Email"
                            value={user.email}
                            onChange={(e) => setUser({ ...user, email: e.target.value })}
                        />
                        <button onClick={handleChangeEmail} className="bg-yellow-500 text-white px-4 py-2 rounded">Change Email</button> */}
                    </div>
                )}
            </div>
        </ProtectedRoute>
    );
}
