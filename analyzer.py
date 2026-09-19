
import pandas as pd

def categorize_transaction(description: str) -> str:
    
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

def detect_recurring_expenses(transactions_data: list[dict]) -> list[dict]:
    if not transactions_data:
        return []
    
    # Load the raw dictionaries into a Pandas DataFrame
    df = pd.DataFrame(transactions_data)
    
    # Group by description and amount, then count the occurrences
    subscription_groups = df.groupby(['raw_description', 'amount']).size().reset_index(name='frequency')
    
    # Filter for items that appear more than once
    recurring_df = subscription_groups[subscription_groups['frequency'] > 1]
    
    # Convert the resulting DataFrame back into a clean list of dictionaries
    return recurring_df.to_dict('records')
