
def categorize_transaction(description: str) -> str:
    """
    Takes a raw transaction description and returns a category.
    """
    desc = description.lower()
    
    if 'netflix' in desc or 'spotify' in desc or 'hulu' in desc:
        return 'Entertainment'
    elif 'uber' in desc or 'lyft' in desc or 'transit' in desc:
        return 'Transport'
    elif 'walmart' in desc or 'whole foods' in desc or 'grocery' in desc:
        return 'Groceries'
    elif 'salary' in desc or 'payroll' in desc:
        return 'Income'
    elif 'starbucks' in desc or 'restaurant' in desc or 'doordash' in desc:
        return 'Dining'
    else:
        return 'Other'