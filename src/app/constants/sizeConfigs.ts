export interface Size {
    id: string;
    name: string;
    price: number;
    maxVarieties: number;
    minVarieties: number;
    totalSlices: number;
    allowedVarieties?: string[];
    excludedVarieties?: string[];
    boxPrice?: number;
    description: string;
}

export const sizeConfigs: Size[] = [
    {
        id: '1',
        name: 'Big Bilao',
        price: 520.00,
        maxVarieties: 4,
        minVarieties: 1,
        totalSlices: 60,
        excludedVarieties: ['Cassava'],
        description: 'Can have up to 4 varieties (no Cassava)'
    },
    {
        id: '2',
        name: 'Tray',
        price: 420.00,
        maxVarieties: 4,
        minVarieties: 1,
        totalSlices: 48,
        description: 'Can have up to 4 varieties'
    },
    {
        id: '3',
        name: 'Small',
        price: 280.00,
        maxVarieties: 1,
        minVarieties: 1,
        totalSlices: 30,
        allowedVarieties: ['Bibingka'],
        description: 'Bibingka only'
    },
    {
        id: '4',
        name: 'Half Tray',
        price: 240.00,
        maxVarieties: 2,
        minVarieties: 1,
        totalSlices: 24,
        description: 'Can have up to 2 varieties'
    },
    {
        id: '5',
        name: 'Solo',
        price: 200.00,
        maxVarieties: 1,
        minVarieties: 1,
        totalSlices: 20,
        allowedVarieties: ['Bibingka'],
        description: 'Bibingka only'
    },
    {
        id: '6',
        name: '1/4 Slice',
        price: 140.00,
        maxVarieties: 1,
        minVarieties: 1,
        totalSlices: 12,
        boxPrice: 140.00,
        description: 'Can only have 1 variety'
    }
]; 