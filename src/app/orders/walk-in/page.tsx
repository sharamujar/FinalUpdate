"use client";

import { useState, useEffect } from "react";
import { db } from "../../firebase-config";
import ProtectedRoute from "@/app/components/protectedroute";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  doc,
  runTransaction,
  Transaction,
} from "firebase/firestore";
import Sidebar from "@/app/components/Sidebar";

interface Stock {
  id: string;
  sizeId: string;
  sizeName: string;
  combinations: Array<{
    varieties: string[];
    quantity: number;
  }>;
  totalQuantity: number;
  price: number;
}

interface SelectedProduct {
  id: string;
  size: string;
  varieties: string[];
  selectedVarieties: string[];
  quantity: number;
  price: number;
  stockQuantity: number;
  combinations: Array<{
    varieties: string[];
    quantity: number;
  }>;
}

interface OrderItem {
  cartId: string;
  productSize: string;
  productVarieties: string[];
  productQuantity: number;
  productPrice: number;
}

interface RawOrderItem {
  cartId?: string;
  productSize?: string;
  productVarieties?: unknown;
  productQuantity?: number;
  productPrice?: number;
}

interface Order {
  id: string;
  userId?: string;
  orderType: string;
  customerName: string;
  orderDetails: {
    orderType: string;
    status: string;
    paymentMethod: string;
    paymentStatus: string;
    gcashReference?: string;
    totalAmount: number;
    createdAt: string;
    updatedAt: string;
    pickupDate: string;
    pickupTime: string;
  };
  items: Array<OrderItem>;
}

export default function WalkInOrders() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [customerName, setCustomerName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [gcashReference, setGcashReference] = useState<string>("");

  useEffect(() => {
    fetchStocks();
    fetchWalkInOrders();
  }, []);

  const fetchStocks = async () => {
    try {
      const stocksSnapshot = await getDocs(collection(db, "stocks"));
      const stocksList = stocksSnapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            sizeId: data.sizeId || "",
            sizeName: data.sizeName || "",
            combinations: data.combinations || [],
            totalQuantity: data.totalQuantity || 0,
            price: data.price || 0
          };
        })
        .filter(stock => stock.totalQuantity > 0) as Stock[];
      
      setStocks(stocksList);
    } catch (error) {
      console.error("Error fetching stocks:", error);
    }
  };

  const fetchWalkInOrders = async () => {
    try {
      const ordersRef = collection(db, "orders");
      const q = query(
        ordersRef, 
        where("orderType", "==", "walk-in"),
        where("orderDetails.orderType", "==", "walk-in")
      );
      const snapshot = await getDocs(q);
      const ordersList = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          orderType: data.orderType || "walk-in",
          customerName: data.customerName || "Unknown",
          orderDetails: {
            orderType: data.orderDetails?.orderType || "walk-in",
            status: data.orderDetails?.status || "pending",
            paymentMethod: data.orderDetails?.paymentMethod || "Cash",
            paymentStatus: data.orderDetails?.paymentStatus || "pending",
            gcashReference: data.orderDetails?.gcashReference || null,
            totalAmount: data.orderDetails?.totalAmount || 0,
            createdAt: data.orderDetails?.createdAt || new Date().toISOString(),
            updatedAt: data.orderDetails?.updatedAt || new Date().toISOString(),
            pickupDate: data.orderDetails?.pickupDate || new Date().toISOString(),
            pickupTime: data.orderDetails?.pickupTime || new Date().toLocaleTimeString()
          },
          items: (data.items || []).map((item: RawOrderItem): OrderItem => ({
            cartId: item.cartId || "",
            productSize: item.productSize || "",
            productVarieties: Array.isArray(item.productVarieties) ? item.productVarieties : [],
            productQuantity: item.productQuantity || 0,
            productPrice: item.productPrice || 0
          }))
        };
      });
      setOrders(ordersList);
    } catch (error) {
      console.error("Error fetching walk-in orders:", error);
    }
  };

  const handleAddProduct = (stock: Stock) => {
    const allVarieties = stock.combinations.reduce((acc, combo) => {
      combo.varieties.forEach(variety => {
        if (!acc.includes(variety)) {
          acc.push(variety);
        }
      });
      return acc;
    }, [] as string[]);

    const selectedProduct: SelectedProduct = {
      id: stock.id,
      size: stock.sizeName,
      varieties: allVarieties,
      selectedVarieties: [],
      quantity: 1,
      price: stock.price,
      stockQuantity: stock.totalQuantity,
      combinations: stock.combinations
    };

    if (stock.sizeName !== "Tray" && stock.sizeName !== "Big Bilao") {
      selectedProduct.selectedVarieties = [allVarieties[0]];
    }

    setSelectedProducts([...selectedProducts, selectedProduct]);
    setTotalAmount(prev => prev + stock.price);
  };

  const handleRemoveProduct = (index: number) => {
    const product = selectedProducts[index];
    setSelectedProducts(selectedProducts.filter((_, i) => i !== index));
    setTotalAmount(prev => prev - product.price);
  };

  const handleQuantityChange = (index: number, newQuantity: number) => {
    const product = selectedProducts[index];
    const maxQuantity = product.stockQuantity;
    
    if (newQuantity > 0 && newQuantity <= maxQuantity) {
      const updatedProducts = [...selectedProducts];
      const oldTotal = product.price * product.quantity;
      const newTotal = product.price * newQuantity;
      
      updatedProducts[index] = {
        ...product,
        quantity: newQuantity
      };
      
      setSelectedProducts(updatedProducts);
      setTotalAmount(prev => prev - oldTotal + newTotal);
    }
  };

  const handleVarietyChange = (index: number, selectedOptions: string[]) => {
    const updatedProducts = [...selectedProducts];
    const product = updatedProducts[index];
    
    if ((product.size === "Tray" || product.size === "Big Bilao") && selectedOptions.length > 4) {
      alert("Maximum of 4 varieties allowed for Tray and Big Bilao");
      return;
    }

    updatedProducts[index] = {
      ...product,
      selectedVarieties: selectedOptions
    };
    setSelectedProducts(updatedProducts);
  };

  const handlePaymentMethodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPaymentMethod(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!customerName.trim()) {
      alert("Please enter customer name");
      setLoading(false);
      return;
    }

    if (selectedProducts.length === 0) {
      alert("Please select at least one product");
      setLoading(false);
      return;
    }

    if (paymentMethod === "GCash" && !gcashReference) {
      alert("Please enter GCash reference number");
      setLoading(false);
      return;
    }

    try {
      await runTransaction(db, async (transaction: Transaction) => {
        const stockReads = selectedProducts.map(async (product) => {
          const stockRef = doc(db, "stocks", product.id);
          const stockDoc = await transaction.get(stockRef);
          
          if (!stockDoc.exists()) {
            throw new Error(`Stock not found for ${product.size}`);
          }

          const currentStock = stockDoc.data().totalQuantity;
          if (currentStock < product.quantity) {
            throw new Error(`Insufficient stock for ${product.size}`);
          }

          return {
            ref: stockRef,
            currentStock,
            product
          };
        });

        const stockData = await Promise.all(stockReads);

        const orderRef = collection(db, "orders");
        const now = new Date().toISOString();
        
        const newOrder = {
          orderType: "walk-in",
          customerName: customerName.trim(),
          orderDetails: {
            orderType: "walk-in",
            status: paymentMethod === "Cash" ? "completed" : "pending",
            paymentMethod,
            paymentStatus: paymentMethod === "Cash" ? "completed" : "pending",
            gcashReference: paymentMethod === "GCash" ? gcashReference : null,
            totalAmount,
            createdAt: now,
            updatedAt: now,
            pickupDate: now,
            pickupTime: new Date().toLocaleTimeString('en-US', { 
              hour: 'numeric', 
              minute: '2-digit', 
              hour12: true 
            })
          },
          items: selectedProducts.map(p => ({
            cartId: p.id,
            productSize: p.size,
            productVarieties: p.selectedVarieties,
            productQuantity: p.quantity,
            productPrice: p.price
          }))
        };

        const orderDoc = await addDoc(orderRef, newOrder);

        stockData.forEach(({ ref, currentStock, product }) => {
          transaction.update(ref, {
            totalQuantity: currentStock - product.quantity,
            lastUpdated: serverTimestamp()
          });

          const historyRef = doc(collection(db, "stockHistory"));
          transaction.set(historyRef, {
            stockId: product.id,
            type: "out",
            quantity: product.quantity,
            previousStock: currentStock,
            currentStock: currentStock - product.quantity,
            date: serverTimestamp(),
            reason: `Walk-in order #${orderDoc.id.slice(0, 6)}`,
            updatedBy: "System",
            isDeleted: false
          });
        });

        if (paymentMethod === "Cash") {
          const salesRef = collection(db, "sales");
          const saleData = {
            orderId: orderDoc.id,
            orderType: "walk-in",
            customerName: customerName.trim(),
            amount: totalAmount,
            date: serverTimestamp(),
            items: selectedProducts.map(p => ({
              productSize: p.size,
              productVariety: p.selectedVarieties.join(", "),
              productQuantity: p.quantity,
              productPrice: p.price
            })),
            paymentMethod,
            status: "completed"
          };
          transaction.set(doc(salesRef), saleData);
        }
      });

      setSelectedProducts([]);
      setTotalAmount(0);
      setCustomerName("");
      setPaymentMethod("Cash");
      setGcashReference("");
      
      fetchWalkInOrders();
      fetchStocks();
      
      alert("Order created successfully!");
    } catch (error) {
      console.error("Error creating order:", error);
      if (error instanceof Error) {
        alert(`Failed to create order: ${error.message}`);
      } else {
        alert("Failed to create order. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />
        <div className="flex-grow p-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Walk-in Orders</h1>
          
          <div className="bg-white p-6 rounded-lg shadow-md mb-6">
            <h2 className="text-xl font-semibold mb-4">Create New Order</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={handlePaymentMethodChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="Cash">Cash</option>
                  <option value="GCash">GCash</option>
                </select>
              </div>

              {paymentMethod === "GCash" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">GCash Reference Number</label>
                  <input
                    type="text"
                    value={gcashReference}
                    onChange={(e) => setGcashReference(e.target.value)}
                    required
                    placeholder="Enter GCash reference number"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">Available Stock Items</label>
                <div className="mt-2 space-y-2 max-h-[400px] overflow-y-auto">
                  {stocks.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No items available in stock</p>
                  ) : (
                    stocks.map((stock) => (
                      <div key={stock.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border">
                        <div className="flex-1">
                          <span className="block font-medium">{stock.sizeName}</span>
                          <div className="text-sm text-gray-600">
                            {stock.combinations.map((combo, idx) => (
                              <div key={idx} className="mb-1">
                                <span>Varieties: {combo.varieties.join(", ")}</span>
                                <span className="ml-2 text-gray-500">(Stock: {combo.quantity})</span>
                              </div>
                            ))}
                          </div>
                          <span className="block text-sm font-medium text-blue-600">Price: ₱{stock.price.toLocaleString()}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddProduct(stock)}
                          disabled={stock.totalQuantity === 0}
                          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed ml-4"
                        >
                          Add
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Selected Products</label>
                <div className="mt-2 space-y-4">
                  {selectedProducts.map((product, index) => (
                    <div key={index} className="p-4 bg-gray-50 rounded-lg border">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-medium">{product.size}</h4>
                          <p className="text-sm text-gray-600">Price: ₱{product.price.toLocaleString()}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveProduct(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <span className="sr-only">Remove</span>
                          ×
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            {product.size === "Tray" || product.size === "Big Bilao" 
                              ? `Varieties (Select up to 4)` 
                              : "Variety"}
                          </label>
                          {product.size === "Tray" || product.size === "Big Bilao" ? (
                            <div className="mt-2 space-y-2">
                              {product.varieties.map((variety) => (
                                <label key={variety} className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={product.selectedVarieties.includes(variety)}
                                    onChange={(e) => {
                                      const newSelected = e.target.checked
                                        ? [...product.selectedVarieties, variety]
                                        : product.selectedVarieties.filter(v => v !== variety);
                                      handleVarietyChange(index, newSelected);
                                    }}
                                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                  />
                                  <span className="ml-2 text-sm text-gray-700">{variety}</span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <select
                              value={product.selectedVarieties[0] || ""}
                              onChange={(e) => handleVarietyChange(index, [e.target.value])}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                              {product.varieties.map((variety) => (
                                <option key={variety} value={variety}>
                                  {variety}
                                </option>
                              ))}
                            </select>
                          )}
                          {(product.size === "Tray" || product.size === "Big Bilao") && 
                            product.selectedVarieties.length === 0 && (
                            <p className="mt-1 text-sm text-red-500">
                              Please select at least one variety
                            </p>
                          )}
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Quantity</label>
                          <div className="mt-1 flex rounded-md shadow-sm">
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(index, product.quantity - 1)}
                              className="px-3 py-1 border border-r-0 border-gray-300 rounded-l-md bg-gray-50 text-gray-500 hover:bg-gray-100"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              value={product.quantity}
                              onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 0)}
                              min="1"
                              max={product.stockQuantity}
                              className="block w-20 border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-center"
                            />
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(index, product.quantity + 1)}
                              className="px-3 py-1 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-gray-500 hover:bg-gray-100"
                            >
                              +
                            </button>
                          </div>
                          <p className="mt-1 text-sm text-gray-500">Max: {product.stockQuantity}</p>
                        </div>
                      </div>
                      
                      <div className="mt-2 text-right text-sm font-medium text-gray-900">
                        Subtotal: ₱{(product.price * product.quantity).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-xl font-semibold">
                Total Amount: ₱{totalAmount.toLocaleString()}
              </div>

              <button
                type="submit"
                disabled={loading || selectedProducts.length === 0}
                className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? "Processing..." : "Create Order"}
              </button>
            </form>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Recent Walk-in Orders</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        #{order.id.slice(0, 6)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.customerName}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {order.items?.map((item, index) => (
                          <div key={index} className="mb-1">
                            {item.productSize} - {item.productQuantity}x
                            {item.productVarieties && item.productVarieties.length > 0 && (
                              <span className="text-gray-400 text-xs ml-1">
                                ({item.productVarieties.join(", ")})
                              </span>
                            )}
                          </div>
                        )) || "No items"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ₱{order.orderDetails?.totalAmount?.toLocaleString() || "0"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.orderDetails?.paymentMethod || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          order.orderDetails?.status === "completed" ? "bg-green-100 text-green-800" :
                          order.orderDetails?.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                          "bg-gray-100 text-gray-800"
                        }`}>
                          {order.orderDetails?.status || "unknown"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.orderDetails?.gcashReference || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.orderDetails?.createdAt ? new Date(order.orderDetails.createdAt).toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
} 