"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase-config";
import Sidebar from "@/app/components/Sidebar";
import ProtectedRoute from "@/app/components/protectedroute";
import { ArrowLeft, Clock, Package2, Receipt, User } from "lucide-react";

interface Order {
  id: string;
  userId?: string;
  userDetails?: {
    firstName: string;
    lastName: string;
  };
  orderDetails: {
    pickupTime: string;
    pickupDate: string;
    status: string;
    orderStatus?: string;
    totalAmount: number;
    paymentMethod: string;
    paymentStatus?: string;
    gcashReference?: string;
    createdAt: string;
    updatedAt?: string;
    isScheduled?: boolean;
  };
  items: Array<{
    cartId: string;
    productSize: string;
    productVarieties: string[];
    productQuantity: number;
    productPrice: number;
  }>;
}

export default function OrderDetails() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const orderRef = doc(db, "orders", params.id);
        const orderDoc = await getDoc(orderRef);
        
        if (!orderDoc.exists()) {
          console.error("Order not found");
          return;
        }

        setOrder({
          id: orderDoc.id,
          ...orderDoc.data()
        } as Order);
      } catch (error) {
        console.error("Error fetching order:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [params.id]);

  const getStatusColor = (status: string | undefined) => {
    if (!status) return "bg-gray-100 text-gray-800";
    switch (status.toLowerCase()) {
      case "order confirmed":
        return "bg-blue-100 text-blue-800";
      case "stock reserved":
        return "bg-indigo-100 text-indigo-800";
      case "preparing order":
        return "bg-yellow-100 text-yellow-800";
      case "ready for pickup":
        return "bg-green-100 text-green-800";
      case "completed":
        return "bg-gray-100 text-gray-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPaymentMethodBadge = (paymentMethod: string, paymentStatus?: string) => {
    if (paymentMethod === 'GCash') {
      return paymentStatus === 'approved' 
        ? 'bg-green-100 text-green-800' 
        : 'bg-yellow-100 text-yellow-800';
    }
    return 'bg-blue-100 text-blue-800';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex h-screen bg-gray-100">
          <Sidebar />
          <div className="flex-1 p-8">
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!order) {
    return (
      <ProtectedRoute>
        <div className="flex h-screen bg-gray-100">
          <Sidebar />
          <div className="flex-1 p-8">
            <div className="text-center">Order not found.</div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-gray-100">
        <Sidebar />
        <div className="flex-1 overflow-auto">
          <div className="p-8">
            {/* Back button and Order ID header */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => router.back()}
                className="flex items-center text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                Order #{order.id.slice(0, 6)}
              </h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Order Information */}
              <div className="lg:col-span-2 space-y-6">
                {/* Order Status Card */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Order Status</h2>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(order.orderDetails.status)}`}>
                      {order.orderDetails.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Created</p>
                      <p className="text-sm font-medium">
                        {formatDate(order.orderDetails.createdAt)} at {formatTime(order.orderDetails.createdAt)}
                      </p>
                    </div>
                    {order.orderDetails.updatedAt && (
                      <div>
                        <p className="text-sm text-gray-500">Last Updated</p>
                        <p className="text-sm font-medium">
                          {formatDate(order.orderDetails.updatedAt)} at {formatTime(order.orderDetails.updatedAt)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Order Items Card */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Package2 className="w-5 h-5 text-gray-400" />
                    <h2 className="text-lg font-semibold text-gray-900">Order Items</h2>
                  </div>
                  <div className="space-y-4">
                    {order.items.map((item, index) => (
                      <div key={item.cartId} className="border-b last:border-0 pb-4 last:pb-0">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="font-medium text-gray-900">Size: {item.productSize}</p>
                            <p className="text-sm text-gray-600">Varieties: {item.productVarieties.join(", ")}</p>
                            <p className="text-sm text-gray-600">Quantity: {item.productQuantity}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-gray-900">₱{item.productPrice.toLocaleString()}</p>
                            <p className="text-sm text-gray-600">
                              Subtotal: ₱{(item.productPrice * item.productQuantity).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="pt-4 border-t">
                      <div className="flex justify-between">
                        <p className="font-semibold text-gray-900">Total Amount</p>
                        <p className="font-semibold text-gray-900">₱{order.orderDetails.totalAmount.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar Information */}
              <div className="space-y-6">
                {/* Customer Information Card */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <User className="w-5 h-5 text-gray-400" />
                    <h2 className="text-lg font-semibold text-gray-900">Customer</h2>
                  </div>
                  <div className="space-y-2">
                    <p className="text-gray-900">
                      {order.userDetails
                        ? `${order.userDetails.firstName} ${order.userDetails.lastName}`.trim()
                        : "Walk-in Customer"}
                    </p>
                    {order.userId && (
                      <p className="text-sm text-gray-500">Customer ID: {order.userId}</p>
                    )}
                  </div>
                </div>

                {/* Payment Information Card */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Receipt className="w-5 h-5 text-gray-400" />
                    <h2 className="text-lg font-semibold text-gray-900">Payment</h2>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-500">Method</p>
                      <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-medium ${getPaymentMethodBadge(order.orderDetails.paymentMethod, order.orderDetails.paymentStatus)}`}>
                        {order.orderDetails.paymentMethod}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Status</p>
                      <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-medium ${
                        order.orderDetails.paymentStatus === "approved"
                          ? "bg-green-100 text-green-800"
                          : order.orderDetails.paymentStatus === "rejected"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}>
                        {order.orderDetails.paymentStatus || "pending"}
                      </span>
                    </div>
                    {order.orderDetails.gcashReference && (
                      <div>
                        <p className="text-sm text-gray-500">GCash Reference</p>
                        <p className="text-sm font-medium">{order.orderDetails.gcashReference}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pickup Information Card */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-gray-400" />
                    <h2 className="text-lg font-semibold text-gray-900">Pickup Details</h2>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-500">Date</p>
                      <p className="font-medium">{formatDate(order.orderDetails.pickupDate)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Time</p>
                      <p className="font-medium">{order.orderDetails.pickupTime}</p>
                    </div>
                    {order.orderDetails.isScheduled && (
                      <div className="pt-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Scheduled Order
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
} 